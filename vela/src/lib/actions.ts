"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clearAuthCookies, getMfaChallenge, getSessionUserId, requireUser, setMfaChallengeCookie, setSessionCookie } from "@/lib/auth";
import { decryptSensitive, encryptSensitive } from "@/lib/sensitive";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";
import { parseCents } from "@/lib/money";
import { lastFourDigits } from "@/lib/external-account-display";
import { claimUsername, findUserByLoginIdentifier, isUniqueViolation, isUsernameTaken, USERNAME_UNAVAILABLE_MESSAGE } from "@/lib/identity";
import { validateUsername } from "@/lib/username";
import { isCheckingLikeType, productByCode } from "@/lib/products";

// Compared against when no user matches, so "unknown user" and "wrong passcode" take similar time.
const DUMMY_PASSWORD_HASH = "$2a$10$uY4y1.VITBIwxsGJUvxHnO/WMzQTPQt4TC3yc53PawwiHIlwvyc36";

export type ActionState = { error?: string; success?: boolean; message?: string } | null;

const ref = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh() {
  for (const p of ["/dashboard", "/transactions", "/transfer", "/receive", "/bill-pay", "/cards", "/linked-accounts", "/settings", "/products", "/admin"]) revalidatePath(p);
  revalidatePath("/accounts", "layout");
}

/* ---------------------------------- auth ---------------------------------- */

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  // "username" is the primary field; "email" is still accepted so existing clients and users
  // who have not chosen a username yet keep working. Either way it is one generic error below.
  const identifier = str(fd, "username") || str(fd, "email");
  const password = String(fd.get("password") ?? "");
  const user = await findUserByLoginIdentifier(db, identifier);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk) {
    return { error: "The User ID or passcode you entered is incorrect." };
  }
  if (user.enrollmentStatus === "PENDING_APPROVAL") return { error: "Your enrollment is being processed. Please try signing in again later." };
  if (user.enrollmentStatus !== "APPROVED") return { error: "This enrollment is not active. Please contact support." };
  if (user.accessLocked) {
    const reason = (user.lockReason ?? "").trim();
    return { error: reason ? `This account is locked. ${reason}` : "This account is locked. Contact support." };
  }
  if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) {
    return { error: "Too many incorrect authenticator codes. Try again in a few minutes." };
  }
  if (user.mfaEnabled) {
    await setMfaChallengeCookie(user.id, "verify");
    redirect("/mfa/verify");
  }
  // First sign-in: register a Google Authenticator (TOTP) secret.
  await db.user.update({
    where: { id: user.id },
    data: {
      mfaPendingSecretEncrypted: encryptSensitive(generateTotpSecret()),
      mfaPendingExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  await setMfaChallengeCookie(user.id, "setup");
  redirect("/mfa/setup");
}

export async function signupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const firstName = str(fd, "firstName");
  const lastName = str(fd, "lastName");
  if (!firstName || !lastName || !email) return { error: "Enter your name and email address." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const username = validateUsername(str(fd, "username"));
  if (!username.ok) return { error: username.error };
  if (password.length < 8) return { error: "Your passcode must be at least 8 characters." };
  if (await db.user.findUnique({ where: { email } })) return { error: "An enrollment with this email already exists. Try signing in instead." };
  if (await isUsernameTaken(db, username.normalized)) return { error: USERNAME_UNAVAILABLE_MESSAGE };

  let user;
  try {
    user = await db.user.create({
      data: {
        email,
        username: username.username,
        usernameNormalized: username.normalized,
        passwordHash: await bcrypt.hash(password, 10),
        firstName,
        lastName,
        phone: str(fd, "phone") || null,
        enrollmentStatus: "PENDING_APPROVAL",
      },
    });
  } catch (error) {
    // The unique indexes are the source of truth if two enrollments race past the checks above.
    if (!isUniqueViolation(error)) throw error;
    if (await db.user.findUnique({ where: { email } })) return { error: "An enrollment with this email already exists. Try signing in instead." };
    return { error: USERNAME_UNAVAILABLE_MESSAGE };
  }
  // Standard zero-balance accounts; the admin may optionally add generated
  // 2023-2026 history when approving the enrollment.
  const suffix = Math.floor(100000 + Math.random() * 899999);
  await db.account.create({ data: { userId: user.id, type: "CHECKING", name: "Everyday Checking", accountNumber: `1847${suffix}14`, routingNumber: "021000021", balance: 0 } });
  await db.account.create({ data: { userId: user.id, type: "SAVINGS", name: "High-Yield Savings", accountNumber: `1847${suffix}22`, routingNumber: "021000021", balance: 0, apy: 4.25 } });
  redirect("/enrollment/pending");
}

export async function logoutAction(): Promise<void> {
  await clearAuthCookies();
  redirect("/login");
}

/** Sliding idle session: refresh JWT + cookie while the member is active. */
export async function touchSessionAction(): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.enrollmentStatus !== "APPROVED" || user.accessLocked) {
    await clearAuthCookies();
    return { ok: false };
  }
  await setSessionCookie(user.id);
  return { ok: true };
}

/** Clear the session after the idle watchdog fires. The client then sends the member to sign-in. */
export async function expireIdleSessionAction(): Promise<{ ok: true }> {
  await clearAuthCookies();
  return { ok: true };
}

async function challengeUser(stage: "setup" | "verify") {
  const challenge = await getMfaChallenge();
  if (!challenge || challenge.stage !== stage) redirect("/login");
  const user = await db.user.findUnique({ where: { id: challenge.userId } });
  if (!user) redirect("/login");
  return user;
}

function lockedAccountError(user: { accessLocked?: boolean; lockReason?: string | null }): ActionState | null {
  if (!user.accessLocked) return null;
  const reason = (user.lockReason ?? "").trim();
  return { error: reason ? `This account is locked. ${reason}` : "This account is locked. Contact support." };
}

export async function completeTotpSetupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await challengeUser("setup");
  const locked = lockedAccountError(user);
  if (locked) return locked;
  if (!user.mfaPendingSecretEncrypted || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= new Date()) {
    return { error: "This setup session has expired. Sign in again to restart setup." };
  }
  let secret: string;
  try { secret = decryptSensitive(user.mfaPendingSecretEncrypted); } catch { return { error: "This setup session is invalid. Sign in again." }; }
  const step = verifyTotp(secret, str(fd, "totpCode"));
  if (step === null) return { error: "That code didn't match. Check the time on your phone and try the current code." };
  await db.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      totpSecretEncrypted: user.mfaPendingSecretEncrypted,
      totpLastUsedStep: step,
      mfaPendingSecretEncrypted: null,
      mfaPendingExpiresAt: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    },
  });
  await setSessionCookie(user.id);
  redirect("/dashboard");
}

export async function verifyTotpLoginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await challengeUser("verify");
  const locked = lockedAccountError(user);
  if (locked) return locked;
  if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) return { error: "Too many incorrect codes. Try again in a few minutes." };
  if (!user.totpSecretEncrypted) return { error: "Authenticator is not set up for this user." };
  let secret: string;
  try { secret = decryptSensitive(user.totpSecretEncrypted); } catch { return { error: "Authenticator data is invalid. Ask an administrator to reset it." }; }
  const step = verifyTotp(secret, str(fd, "totpCode"), user.totpLastUsedStep);
  if (step === null) {
    const attempts = (user.mfaFailedAttempts ?? 0) + 1;
    await db.user.update({
      where: { id: user.id },
      data: { mfaFailedAttempts: attempts, mfaLockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null },
    });
    return { error: "That code didn't match. Enter the current six-digit code from Google Authenticator." };
  }
  await db.user.update({ where: { id: user.id }, data: { totpLastUsedStep: step, mfaFailedAttempts: 0, mfaLockedUntil: null } });
  await setSessionCookie(user.id);
  redirect("/dashboard");
}

/* ------------------------------- money moves ------------------------------ */

async function ownAccount(userId: string, accountId: string) {
  return db.account.findFirst({ where: { id: accountId, userId, status: "ACTIVE" } });
}

export async function depositAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const account = await ownAccount(user.id, str(fd, "accountId"));
  const amount = parseCents(str(fd, "amount"));
  if (!account) return { error: "Choose one of your accounts." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than $0." };
  await db.transaction.create({
    data: { accountId: account.id, amount, type: "DEPOSIT", category: "TRANSFER", description: "Deposit", counterparty: str(fd, "source") || "External bank ••1234", paymentMethod: "ACH", status: "PENDING_APPROVAL", reference: ref("dep") },
  });
  refresh();
  redirect("/dashboard?toast=deposit");
}

export async function createStripeCheckoutAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireUser();
  return { error: "This payment option is temporarily unavailable. Please use another deposit method." };
}

export async function withdrawAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const account = await ownAccount(user.id, str(fd, "accountId"));
  const destination = await db.externalAccount.findFirst({ where: { id: str(fd, "externalAccountId"), userId: user.id, status: "VERIFIED" } });
  const amount = parseCents(str(fd, "amount"));
  if (!account) return { error: "Choose one of your accounts." };
  if (!destination) return { error: "Choose a verified external destination." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than $0." };
  if (account.balance < amount) return { error: "Insufficient funds for this transfer." };
  await db.transaction.create({
    data: { accountId: account.id, amount: -amount, type: "WITHDRAWAL", category: "TRANSFER", description: "External transfer", counterparty: `${destination.institutionName} · •••• ${lastFourDigits(destination.accountMask)}`, paymentMethod: str(fd, "paymentMethod") || "ACH", status: "PENDING_APPROVAL", reference: ref("ext") },
  });
  refresh();
  redirect("/dashboard?toast=withdraw");
}

export async function mobileDepositAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const account = await ownAccount(user.id, str(fd, "accountId"));
  const amount = parseCents(str(fd, "amount"));
  if (!account) return { error: "Choose one of your accounts." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than $0." };
  await db.transaction.create({
    data: { accountId: account.id, amount, type: "DEPOSIT", category: "TRANSFER", description: "Mobile check deposit", counterparty: `Check ${str(fd, "checkNumber") || "••1023"}`, paymentMethod: "MOBILE_DEPOSIT", status: "PENDING_APPROVAL", reference: ref("mob") },
  });
  refresh();
  redirect("/dashboard?toast=mobile-deposit");
}

export async function transferAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const from = await ownAccount(user.id, str(fd, "fromId"));
  const to = await ownAccount(user.id, str(fd, "toId"));
  const amount = parseCents(str(fd, "amount"));
  if (!from || !to || from.id === to.id) return { error: "Choose two different accounts." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than $0." };
  if (from.balance < amount) return { error: "Insufficient funds for this transfer." };
  const reference = ref("trf");
  await db.transaction.create({ data: { accountId: from.id, amount: -amount, type: "TRANSFER_OUT", category: "TRANSFER", description: `Transfer to ${to.name}`, counterparty: `To ${to.name}`, paymentMethod: "INTERNAL", status: "PENDING_APPROVAL", reference } });
  await db.transaction.create({ data: { accountId: to.id, amount, type: "TRANSFER_IN", category: "TRANSFER", description: `Transfer from ${from.name}`, counterparty: `From ${from.name}`, paymentMethod: "INTERNAL", status: "PENDING_APPROVAL", reference } });
  refresh();
  redirect("/dashboard?toast=transfer");
}

export async function sendMoneyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const from = await ownAccount(user.id, str(fd, "fromId"));
  const recipientEmail = str(fd, "recipientEmail").toLowerCase();
  const amount = parseCents(str(fd, "amount"));
  if (!from) return { error: "Choose one of your accounts." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than $0." };
  if (from.balance < amount) return { error: "Insufficient funds for this payment." };
  const recipient = recipientEmail ? await db.user.findUnique({ where: { email: recipientEmail } }) : null;
  if (!recipient || recipient.id === user.id) return { error: "Enter another FMB member's email." };
  const recipientAccount = await db.account.findFirst({ where: { userId: recipient.id, type: "CHECKING", status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!recipientAccount) return { error: "That member has no active checking account." };
  const reference = ref("pay");
  await db.transaction.create({ data: { accountId: from.id, amount: -amount, type: "TRANSFER_OUT", category: "TRANSFER", description: `Quick Pay to ${recipient.firstName} ${recipient.lastName}`, counterparty: recipient.email, paymentMethod: "QUICK_PAY", status: "PENDING_APPROVAL", reference } });
  await db.transaction.create({ data: { accountId: recipientAccount.id, amount, type: "TRANSFER_IN", category: "TRANSFER", description: `Quick Pay from ${user.firstName} ${user.lastName}`, counterparty: user.email, paymentMethod: "QUICK_PAY", status: "PENDING_APPROVAL", reference } });
  refresh();
  redirect("/dashboard?toast=send");
}

export async function requestMoneyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const account = await ownAccount(user.id, str(fd, "accountId"));
  const recipientEmail = str(fd, "recipientEmail").toLowerCase();
  const amount = parseCents(str(fd, "amount"));
  if (!account) return { error: "Choose the account to receive the money." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than $0." };
  const recipient = recipientEmail ? await db.user.findUnique({ where: { email: recipientEmail } }) : null;
  if (!recipient || recipient.id === user.id) return { error: "Enter another FMB member's email." };
  await db.moneyRequest.create({
    data: { requesterId: user.id, recipientId: recipient.id, recipientEmail, accountId: account.id, amount, memo: str(fd, "memo") || null, reference: ref("req") },
  });
  refresh();
  return { success: true, message: "Request sent. It will appear in the other member's Receive money page." };
}

export async function payMoneyRequestAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const request = await db.moneyRequest.findFirst({ where: { id: str(fd, "requestId"), recipientId: user.id, status: "OPEN" } });
  if (!request) redirect("/receive");
  const from = await ownAccount(user.id, str(fd, "accountId"));
  if (!from || from.balance < request.amount) redirect("/receive");
  await db.transaction.create({ data: { accountId: from.id, amount: -request.amount, type: "TRANSFER_OUT", category: "TRANSFER", description: "Money request payment", counterparty: request.recipientEmail, paymentMethod: "QUICK_PAY", status: "PENDING_APPROVAL", reference: request.reference } });
  await db.transaction.create({ data: { accountId: request.accountId, amount: request.amount, type: "TRANSFER_IN", category: "TRANSFER", description: "Money request payment", counterparty: user.email, paymentMethod: "QUICK_PAY", status: "PENDING_APPROVAL", reference: request.reference } });
  await db.moneyRequest.update({ where: { id: request.id }, data: { status: "PENDING_APPROVAL" } });
  refresh();
  redirect("/receive");
}

export async function closeMoneyRequestAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const request = await db.moneyRequest.findFirst({ where: { id: str(fd, "requestId"), status: "OPEN" } });
  if (request && (request.recipientId === user.id || request.requesterId === user.id)) {
    await db.moneyRequest.update({
      where: { id: request.id },
      data: { status: str(fd, "side") === "requester" ? "CANCELED" : "DECLINED" },
    });
  }
  refresh();
  redirect("/receive");
}

/* --------------------------------- bill pay -------------------------------- */

export async function addBillPayeeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = str(fd, "name");
  if (!name) return { error: "Enter the biller name." };
  await db.billPayee.create({
    data: {
      userId: user.id,
      name,
      category: str(fd, "category") || "OTHER",
      accountMask: `•••• ${lastFourDigits(str(fd, "accountNumber"))}`,
      encryptedAccountNumber: encryptSensitive(str(fd, "accountNumber")),
    },
  });
  refresh();
  return { success: true, message: "Biller saved." };
}

export async function billPayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const payee = await db.billPayee.findFirst({ where: { id: str(fd, "payeeId"), userId: user.id } });
  const account = await ownAccount(user.id, str(fd, "accountId"));
  const amount = parseCents(str(fd, "amount"));
  const scheduledFor = new Date(`${str(fd, "scheduledFor") || new Date().toISOString().slice(0, 10)}T12:00:00`);
  if (!payee) return { error: "Choose a saved biller." };
  if (!account) return { error: "Choose one of your accounts." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than $0." };
  if (account.balance < amount) return { error: "Insufficient funds for this payment." };
  const confirmationNumber = ref("bp").toUpperCase();
  await db.billPayment.create({
    data: {
      userId: user.id, payeeId: payee.id, accountId: account.id, amount, scheduledFor,
      frequency: str(fd, "frequency") === "MONTHLY" ? "MONTHLY" : "ONCE",
      memo: str(fd, "memo") || null, status: "PENDING_APPROVAL", confirmationNumber,
    },
  });
  await db.transaction.create({
    data: { accountId: account.id, amount: -amount, type: "PAYMENT", category: payee.category, description: payee.name, counterparty: payee.name, paymentMethod: "BILL_PAY", status: "PENDING_APPROVAL", reference: confirmationNumber },
  });
  refresh();
  redirect(`/bill-pay?confirmation=${confirmationNumber}`);
}

/* ---------------------------------- cards ---------------------------------- */

async function ownCard(userId: string, cardId: string) {
  const card = await db.card.findFirst({ where: { id: cardId } });
  if (!card) return null;
  const account = await db.account.findFirst({ where: { id: card.accountId, userId } });
  return account ? card : null;
}

export async function applyProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const product = productByCode(str(fd, "productCode"));
  if (!product) return { error: "Choose a product to apply for." };
  const nickname = str(fd, "nickname").slice(0, 40) || null;
  const linkedAccountId = str(fd, "linkedAccountId") || null;

  if (product.kind === "DEBIT_CARD") {
    if (!linkedAccountId) return { error: "Choose the checking account this debit card should draw from." };
    const account = await ownAccount(user.id, linkedAccountId);
    if (!account || !isCheckingLikeType(account.type)) return { error: "Choose a checking account for this debit card." };
    const existingCard = await db.card.findFirst({ where: { accountId: account.id, kind: "DEBIT", status: { not: "CLOSED" } } });
    if (existingCard) return { error: "That account already has a debit card. Freeze it from Card Services if you need to replace it." };
  }

  const pendingWhere: Record<string, unknown> = { userId: user.id, productCode: product.code, status: "PENDING_APPROVAL" };
  if (product.kind === "DEBIT_CARD") pendingWhere.linkedAccountId = linkedAccountId;
  const pending = await db.productApplication.findFirst({ where: pendingWhere });
  if (pending) return { error: "You already have an application for this product awaiting review." };

  await db.productApplication.create({
    data: {
      userId: user.id,
      kind: product.kind,
      productCode: product.code,
      linkedAccountId: product.kind === "DEBIT_CARD" ? linkedAccountId : null,
      nickname,
    },
  });
  refresh();
  return { success: true, message: "Application submitted. The product will appear on your accounts after it is approved." };
}

export async function toggleCardAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const card = await ownCard(user.id, str(fd, "cardId"));
  if (!card) return;
  await db.card.update({ where: { id: card.id }, data: { status: card.status === "FROZEN" ? "ACTIVE" : "FROZEN" } });
  refresh();
}

export async function updateCardLimitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const card = await ownCard(user.id, str(fd, "cardId"));
  const limit = parseCents(str(fd, "dailyLimit"));
  if (!card) return { error: "Card not found." };
  if (!limit || limit <= 0) return { error: "Enter a valid daily limit." };
  await db.card.update({ where: { id: card.id }, data: { dailyLimit: limit } });
  refresh();
  return { success: true, message: "Daily limit updated." };
}

/* ----------------------------- profile/settings ---------------------------- */

export async function updateProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  await db.user.update({
    where: { id: user.id },
    data: { firstName: str(fd, "firstName") || user.firstName, lastName: str(fd, "lastName") || user.lastName, phone: str(fd, "phone") || null },
  });
  refresh();
  return { success: true };
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) return { error: "Too many incorrect codes. Try again in a few minutes." };
  if (!user.mfaEnabled || !user.totpSecretEncrypted) {
    return { error: "Set up Google Authenticator before changing your passcode. Sign out and sign in again to enroll." };
  }
  if (!(await bcrypt.compare(String(fd.get("currentPassword") ?? ""), user.passwordHash))) {
    return { error: "Your current passcode is incorrect." };
  }
  const next = String(fd.get("newPassword") ?? "");
  if (next.length < 8) return { error: "Your new passcode must be at least 8 characters." };
  if (await bcrypt.compare(next, user.passwordHash)) return { error: "Choose a new passcode that is different from your current one." };

  let secret: string;
  try { secret = decryptSensitive(user.totpSecretEncrypted); } catch { return { error: "Authenticator data is invalid. Ask an administrator to reset it." }; }
  const step = verifyTotp(secret, str(fd, "totpCode"), user.totpLastUsedStep);
  if (step === null) {
    const attempts = (user.mfaFailedAttempts ?? 0) + 1;
    await db.user.update({
      where: { id: user.id },
      data: { mfaFailedAttempts: attempts, mfaLockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null },
    });
    return { error: "That authenticator code didn't match. Enter the current six-digit code from Google Authenticator." };
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10), totpLastUsedStep: step, mfaFailedAttempts: 0, mfaLockedUntil: null },
  });
  refresh();
  return { success: true };
}

/** Existing users without a Username / User ID choose one here; it is never assigned for them. */
export async function setUsernameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await claimUsername(db, user.id, str(fd, "username"));
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true, message: `Your Username / User ID is now ${result.username}. You can sign in with it or your email.` };
}

/* ----------------------------- linked accounts ----------------------------- */

export async function addExternalAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const accountNumber = str(fd, "accountNumber");
  if (!/^\d{4,17}$/.test(accountNumber)) return { error: "Enter a 4-17 digit account number." };
  await db.externalAccount.create({
    data: {
      userId: user.id,
      institutionName: str(fd, "institutionName"),
      nickname: str(fd, "nickname"),
      accountType: str(fd, "accountType") || "CHECKING",
      accountMask: lastFourDigits(accountNumber),
      status: "PENDING_APPROVAL",
    },
  });
  refresh();
  return { success: true, message: "External destination added. Verification will appear here when available." };
}

export async function verifyExternalAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const account = await db.externalAccount.findFirst({ where: { id: str(fd, "externalAccountId"), userId: user.id, status: "CHALLENGE_ACTIVE" } });
  if (!account) return { error: "This destination is not available for verification." };
  if (account.microdepositExpiresAt && account.microdepositExpiresAt < new Date()) return { error: "The verification amounts have expired." };
  const a1 = parseCents(str(fd, "microdepositAmount1"));
  const a2 = parseCents(str(fd, "microdepositAmount2"));
  const match =
    (a1 === account.microdepositAmount1 && a2 === account.microdepositAmount2) ||
    (a1 === account.microdepositAmount2 && a2 === account.microdepositAmount1);
  if (!match) {
    await db.externalAccount.update({ where: { id: account.id }, data: { microdepositAttempts: (account.microdepositAttempts ?? 0) + 1 } });
    return { error: "Those amounts didn't match. Check and try again." };
  }
  await db.externalAccount.update({ where: { id: account.id }, data: { status: "VERIFIED", verifiedAt: new Date() } });
  refresh();
  return { success: true, message: "External account verified." };
}
