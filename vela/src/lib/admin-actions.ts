"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { containsLongAccountLikeNumber, lastFourDigits, safeInstitutionName, safeSenderName } from "@/lib/external-account-display";
import { isUsernameTaken, USERNAME_UNAVAILABLE_MESSAGE } from "@/lib/identity";
import { parseCents } from "@/lib/money";
import { validateUsername } from "@/lib/username";
import { ensureUserHistory } from "@/lib/history";
import { applyProductHistory } from "@/lib/product-history";
import { allocateAccountNumber, allocateCardLast4, isCheckingLikeType, productByCode, ROUTING_NUMBER } from "@/lib/products";

function randomRef(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function refreshApprovalViews() {
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/receive");
  revalidatePath("/bill-pay");
  revalidatePath("/products");
  revalidatePath("/cards");
  revalidatePath("/accounts", "layout");
}

export async function approveTransactionGroupAction(formData: FormData) {
  const admin = await requireAdmin();
  const groupKey = String(formData.get("groupKey") ?? "").trim();
  const reference = groupKey.startsWith("ref:") ? groupKey.slice(4) : null;
  const transactionId = groupKey.startsWith("id:") ? groupKey.slice(3) : null;
  if (!reference && !transactionId) redirect("/admin?notice=unavailable");
  const pendingWhere = reference ? { reference, status: "PENDING_APPROVAL" } : { id: transactionId!, status: "PENDING_APPROVAL" };

  const pendingRows = await db.transaction.findMany({
    where: pendingWhere,
    select: { id: true, accountId: true, amount: true },
  });
  if (pendingRows.length === 0) redirect("/admin?notice=unavailable");

  try {
    await db.$transaction(async (tx) => {
      const accountOwners = await tx.account.findMany({
        where: { id: { in: [...new Set(pendingRows.map((row) => row.accountId))] } },
        select: { user: { select: { enrollmentStatus: true } } },
      });
      if (accountOwners.some((account) => account.user.enrollmentStatus !== "APPROVED")) {
        throw new Error("ENROLLMENT_PENDING");
      }
      const claimed = await tx.transaction.updateMany({
        where: pendingWhere,
        data: { status: "PROCESSING_APPROVAL" },
      });
      if (claimed.count !== pendingRows.length) throw new Error("ALREADY_REVIEWED");

      const deltas = new Map<string, number>();
      const rowsByAccount = new Map<string, typeof pendingRows>();
      for (const row of pendingRows) {
        deltas.set(row.accountId, (deltas.get(row.accountId) ?? 0) + row.amount);
        const forAccount = rowsByAccount.get(row.accountId) ?? [];
        forAccount.push(row);
        rowsByAccount.set(row.accountId, forAccount);
      }

      const now = new Date();
      for (const [accountId, delta] of deltas) {
        let changed = { count: 1 };
        if (delta < 0) {
          changed = await tx.account.updateMany({
            where: { id: accountId, status: "ACTIVE", balance: { gte: Math.abs(delta) } },
            data: { balance: { decrement: Math.abs(delta) } },
          });
        } else if (delta > 0) {
          changed = await tx.account.updateMany({
            where: { id: accountId, status: "ACTIVE" },
            data: { balance: { increment: delta } },
          });
        }
        if (changed.count !== 1) {
          if (delta < 0) throw new Error("INSUFFICIENT_FUNDS");
          throw new Error("ACCOUNT_UNAVAILABLE");
        }

        const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
        for (const row of rowsByAccount.get(accountId) ?? []) {
          await tx.transaction.update({
            where: { id: row.id },
            data: {
              status: "COMPLETED",
              reviewedById: admin.id,
              reviewedAt: now,
              balanceAfter: account.balance,
            },
          });
        }
      }

      if (reference) {
        await tx.billPayment.updateMany({
          where: { confirmationNumber: reference, status: "PENDING_APPROVAL" },
          data: { status: "SCHEDULED" },
        });
        await tx.moneyRequest.updateMany({
          where: { reference, status: "PENDING_APPROVAL" },
          data: { status: "PAID", paidAt: now },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ENROLLMENT_PENDING") redirect("/admin?notice=enrollment-pending");
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") redirect("/admin?notice=insufficient");
    if (error instanceof Error && error.message === "ACCOUNT_UNAVAILABLE") redirect("/admin?notice=account");
    if (error instanceof Error && error.message === "ALREADY_REVIEWED") redirect("/admin?notice=unavailable");
    console.error("Admin transaction approval failed", error);
    redirect("/admin?notice=error");
  }

  refreshApprovalViews();
  redirect("/admin?notice=approved");
}

export async function rejectTransactionGroupAction(formData: FormData) {
  const admin = await requireAdmin();
  const groupKey = String(formData.get("groupKey") ?? "").trim();
  const reference = groupKey.startsWith("ref:") ? groupKey.slice(4) : null;
  const transactionId = groupKey.startsWith("id:") ? groupKey.slice(3) : null;
  if (!reference && !transactionId) redirect("/admin?notice=unavailable");
  const pendingWhere = reference ? { reference, status: "PENDING_APPROVAL" } : { id: transactionId!, status: "PENDING_APPROVAL" };
  const now = new Date();

  const rejected = await db.$transaction(async (tx) => {
    const result = await tx.transaction.updateMany({
      where: pendingWhere,
      data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now },
    });
    if (result.count === 0) return 0;
    if (reference) {
      await tx.billPayment.updateMany({
        where: { confirmationNumber: reference, status: "PENDING_APPROVAL" },
        data: { status: "CANCELED" },
      });
      await tx.moneyRequest.updateMany({
        where: { reference, status: "PENDING_APPROVAL" },
        data: { status: "DECLINED" },
      });
    }
    return result.count;
  });

  if (rejected === 0) redirect("/admin?notice=unavailable");
  refreshApprovalViews();
  redirect("/admin?notice=rejected");
}

export async function reviewExternalAccountAction(formData: FormData) {
  const admin = await requireAdmin();
  const externalAccountId = String(formData.get("externalAccountId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  if (!externalAccountId || !["issue", "reject"].includes(decision)) redirect("/admin?notice=external-unavailable");

  const where = { id: externalAccountId, status: "PENDING_APPROVAL" };
  const now = new Date();
  if (decision === "reject") {
    const result = await db.externalAccount.updateMany({
      where,
      data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now },
    });
    if (result.count !== 1) redirect("/admin?notice=external-unavailable");
    revalidatePath("/admin");
    revalidatePath("/linked-accounts");
    revalidatePath("/transfer");
    redirect("/admin?notice=external-rejected");
  }

  const amount1 = randomInt(1, 100);
  let amount2 = randomInt(1, 100);
  while (amount2 === amount1) amount2 = randomInt(1, 100);
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const result = await db.externalAccount.updateMany({
    where,
    data: {
      status: "CHALLENGE_ACTIVE",
      microdepositAmount1: amount1,
      microdepositAmount2: amount2,
      microdepositExpiresAt: expiresAt,
      microdepositAttempts: 0,
      reviewedById: admin.id,
      reviewedAt: now,
    },
  });
  if (result.count !== 1) redirect("/admin?notice=external-unavailable");

  revalidatePath("/admin");
  revalidatePath("/linked-accounts");
  revalidatePath("/transfer");
  redirect("/admin?notice=challenge-issued");
}

export async function reviewEnrollmentAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const historyChoice = String(formData.get("historyChoice") ?? "");
  if (!userId || !["approve", "reject"].includes(decision)) redirect("/admin?notice=enrollment-unavailable");
  if (decision === "approve" && !["include", "none"].includes(historyChoice)) {
    redirect("/admin?notice=enrollment-history-choice");
  }

  const where = { id: userId, role: "CUSTOMER", enrollmentStatus: "PENDING_APPROVAL" };
  const now = new Date();
  if (decision === "approve") {
    const result = await db.user.updateMany({
      where,
      data: { enrollmentStatus: "APPROVED", enrollmentReviewedById: admin.id, enrollmentReviewedAt: now },
    });
    if (result.count !== 1) redirect("/admin?notice=enrollment-unavailable");
    let historyProvisioningFailed = false;
    if (historyChoice === "include") {
      // The admin can opt this enrollment into the standard Jan 2023 -> Oct 2026
      // activity. ensureUserHistory is a no-op once a user has completed activity,
      // so existing customer transactions are never overwritten.
      try {
        await ensureUserHistory(db, userId);
      } catch (error) {
        historyProvisioningFailed = true;
        console.error("Failed to provision account history for approved user", userId, error);
      }
    }
    refreshApprovalViews();
    if (historyProvisioningFailed) redirect("/admin?notice=enrollment-history-error");
    redirect(historyChoice === "include" ? "/admin?notice=enrollment-approved-history" : "/admin?notice=enrollment-approved");
  }

  const rejected = await db.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where,
      data: { enrollmentStatus: "REJECTED", enrollmentReviewedById: admin.id, enrollmentReviewedAt: now },
    });
    if (result.count !== 1) return 0;
    const accounts = await tx.account.findMany({ where: { userId }, select: { id: true } });
    if (accounts.length > 0) {
      await tx.transaction.updateMany({
        where: { accountId: { in: accounts.map((account) => account.id) }, status: "PENDING_APPROVAL" },
        data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now },
      });
    }
    return result.count;
  });
  if (rejected !== 1) redirect("/admin?notice=enrollment-unavailable");
  refreshApprovalViews();
  redirect("/admin?notice=enrollment-rejected");
}

export async function adminEnrollCustomerAction(formData: FormData) {
  const admin = await requireAdmin();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const usernameRaw = String(formData.get("username") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const historyChoice = String(formData.get("historyChoice") ?? "").trim();

  if (!firstName || !lastName || !email) redirect("/admin?notice=enroll-error");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/admin?notice=enroll-error");
  const username = validateUsername(usernameRaw);
  if (!username.ok) redirect("/admin?notice=enroll-invalid-username");
  if (password.length < 8) redirect("/admin?notice=enroll-error");
  if (!["include", "none"].includes(historyChoice)) redirect("/admin?notice=enrollment-history-choice");
  if (await db.user.findUnique({ where: { email } })) redirect("/admin?notice=enroll-email-exists");
  if (await isUsernameTaken(db, username.normalized)) redirect("/admin?notice=enroll-username-exists");

  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        email,
        username: username.username,
        usernameNormalized: username.normalized,
        passwordHash: await bcrypt.hash(password, 10),
        firstName,
        lastName,
        phone,
        enrollmentStatus: "APPROVED",
        enrollmentReviewedById: admin.id,
        enrollmentReviewedAt: new Date(),
      },
    });
    userId = user.id;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      if (await db.user.findUnique({ where: { email } })) redirect("/admin?notice=enroll-email-exists");
      redirect("/admin?notice=enroll-username-exists");
    }
    console.error("Admin enroll failed", error);
    redirect("/admin?notice=enroll-error");
  }

  const suffix = Math.floor(100000 + Math.random() * 899999);
  await db.account.create({ data: { userId, type: "CHECKING", name: "Everyday Checking", accountNumber: `1847${suffix}14`, routingNumber: ROUTING_NUMBER, balance: 0 } });
  await db.account.create({ data: { userId, type: "SAVINGS", name: "High-Yield Savings", accountNumber: `1847${suffix}22`, routingNumber: ROUTING_NUMBER, balance: 0, apy: 4.25 } });

  if (historyChoice === "include") {
    try {
      await ensureUserHistory(db, userId);
    } catch (error) {
      console.error("Failed to provision history for admin-enrolled user", userId, error);
      refreshApprovalViews();
      redirect("/admin?notice=enrollment-history-error");
    }
  }

  refreshApprovalViews();
  redirect(historyChoice === "include" ? "/admin?notice=enrollment-approved-history" : "/admin?notice=enrollment-approved");
}

export async function reviewProductApplicationAction(formData: FormData) {
  const admin = await requireAdmin();
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const historyChoice = String(formData.get("historyChoice") ?? "");
  if (!applicationId || !["approve", "reject"].includes(decision)) redirect("/admin?notice=product-unavailable");

  const application = await db.productApplication.findFirst({
    where: { id: applicationId, status: "PENDING_APPROVAL" },
    include: { user: { select: { id: true, email: true, enrollmentStatus: true } } },
  });
  if (!application) redirect("/admin?notice=product-unavailable");
  if (application.user.enrollmentStatus !== "APPROVED") redirect("/admin?notice=enrollment-pending");

  const product = productByCode(application.productCode);
  if (!product) redirect("/admin?notice=product-unavailable");

  const now = new Date();
  if (decision === "reject") {
    const result = await db.productApplication.updateMany({
      where: { id: application.id, status: "PENDING_APPROVAL" },
      data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now },
    });
    if (result.count !== 1) redirect("/admin?notice=product-unavailable");
    refreshApprovalViews();
    redirect("/admin?notice=product-rejected");
  }

  const needsHistoryChoice = product.kind === "ACCOUNT" || product.kind === "CREDIT_CARD";
  if (needsHistoryChoice && !["include", "none"].includes(historyChoice)) {
    redirect("/admin?notice=product-history-choice");
  }

  let createdAccountId: string | null = null;
  let createdCardId: string | null = null;
  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.productApplication.updateMany({
        where: { id: application.id, status: "PENDING_APPROVAL" },
        data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: now },
      });
      if (claimed.count !== 1) throw new Error("ALREADY_REVIEWED");

      if (product.kind === "DEBIT_CARD") {
        const linked = await tx.account.findFirst({
          where: { id: application.linkedAccountId ?? "", userId: application.userId, status: "ACTIVE" },
        });
        if (!linked || !isCheckingLikeType(linked.type)) throw new Error("ACCOUNT_UNAVAILABLE");
        const existing = await tx.card.findFirst({ where: { accountId: linked.id, kind: "DEBIT", status: { not: "CLOSED" } } });
        if (existing) throw new Error("CARD_EXISTS");
        const card = await tx.card.create({
          data: {
            accountId: linked.id,
            last4: allocateCardLast4(application.user.email, `${product.code}:${linked.id}`),
            brand: "Visa",
            kind: "DEBIT",
            dailyLimit: product.dailyLimit ?? 50_000,
          },
        });
        createdCardId = card.id;
      } else {
        const account = await tx.account.create({
          data: {
            userId: application.userId,
            type: product.accountType ?? "CHECKING",
            name: application.nickname?.trim() || product.name,
            accountNumber: await allocateAccountNumber(tx, application.user.email, `${product.code}:${application.id}`),
            routingNumber: ROUTING_NUMBER,
            balance: 0,
            ...(product.apy ? { apy: product.apy } : {}),
          },
        });
        createdAccountId = account.id;
        if (product.kind === "CREDIT_CARD") {
          const card = await tx.card.create({
            data: {
              accountId: account.id,
              last4: allocateCardLast4(application.user.email, `${product.code}:${account.id}`),
              brand: "Visa",
              kind: "CREDIT",
              dailyLimit: product.dailyLimit ?? 200_000,
              creditLimit: product.creditLimit ?? 1_000_000,
            },
          });
          createdCardId = card.id;
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_REVIEWED") redirect("/admin?notice=product-unavailable");
    if (error instanceof Error && error.message === "ACCOUNT_UNAVAILABLE") redirect("/admin?notice=account");
    if (error instanceof Error && error.message === "CARD_EXISTS") redirect("/admin?notice=product-card-exists");
    console.error("Product application approval failed", error);
    redirect("/admin?notice=error");
  }

  if (createdAccountId || createdCardId) {
    await db.productApplication.update({
      where: { id: application.id },
      data: { createdAccountId, createdCardId },
    });
  }

  let historyFailed = false;
  if (needsHistoryChoice && historyChoice === "include" && createdAccountId) {
    const account = await db.account.findUnique({ where: { id: createdAccountId } });
    if (account) {
      try {
        await applyProductHistory(db, { id: application.userId, email: application.user.email }, account, product.code);
      } catch (error) {
        historyFailed = true;
        console.error("Failed to provision product history", application.id, error);
      }
    }
  }

  refreshApprovalViews();
  if (historyFailed) redirect("/admin?notice=product-history-error");
  redirect(historyChoice === "include" ? "/admin?notice=product-approved-history" : "/admin?notice=product-approved");
}

export async function adminResetAuthenticatorAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId || formData.get("confirm") !== "yes") redirect("/admin?notice=authenticator-reset-confirm");

  const result = await db.user.updateMany({
    where: { id: userId, enrollmentStatus: "APPROVED", mfaEnabled: true },
    data: {
      mfaEnabled: false,
      totpSecretEncrypted: null,
      totpLastUsedStep: null,
      mfaPendingSecretEncrypted: null,
      mfaPendingExpiresAt: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    },
  });
  if (result.count !== 1) redirect("/admin?notice=authenticator-unavailable");
  refreshApprovalViews();
  revalidatePath("/login");
  redirect("/admin?notice=authenticator-reset");
}

function parseActivityDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

const ALL_CUSTOMERS = "ALL_CUSTOMERS";

export async function adminCreditAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    recipient: z.string().min(1).max(100),
    paymentMethod: z.enum(["ACH", "WIRE"]),
    senderName: z.string().trim().min(2).max(65).refine((value) => !containsLongAccountLikeNumber(value)),
    sourceName: z.string().trim().max(80).refine((value) => !value || !containsLongAccountLikeNumber(value)),
    sourceLast4: z.string().trim().max(4).refine((value) => !value || /^\d{4}$/.test(value)),
    amountText: z.string().trim().min(1).max(24),
    activityDateText: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse({
    recipient: formData.get("recipient"),
    paymentMethod: formData.get("paymentMethod"),
    senderName: formData.get("senderName"),
    sourceName: formData.get("sourceName"),
    sourceLast4: formData.get("sourceLast4"),
    amountText: formData.get("amount"),
    activityDateText: formData.get("activityDate"),
  });
  if (!parsed.success) redirect("/admin?notice=credit-error");
  if (formData.get("confirm") !== "yes") redirect("/admin?notice=credit-confirm");

  const amount = parseCents(parsed.data.amountText);
  const activityDate = parseActivityDate(parsed.data.activityDateText);
  if (!amount || amount < 100 || amount > 10_000_000 || !activityDate) redirect("/admin?notice=credit-error");

  let targetAccounts: { id: string }[];
  if (parsed.data.recipient === ALL_CUSTOMERS) {
    const checkingAccounts = await db.account.findMany({
      where: {
        type: "CHECKING",
        status: "ACTIVE",
        user: { role: "CUSTOMER", enrollmentStatus: "APPROVED" },
      },
      select: { id: true, userId: true },
      orderBy: { createdAt: "asc" },
    });
    const firstCheckingByUser = new Map<string, { id: string }>();
    for (const account of checkingAccounts) {
      if (!firstCheckingByUser.has(account.userId)) firstCheckingByUser.set(account.userId, { id: account.id });
    }
    targetAccounts = [...firstCheckingByUser.values()];
  } else {
    targetAccounts = await db.account.findMany({
      where: {
        id: parsed.data.recipient,
        status: "ACTIVE",
        user: { role: "CUSTOMER", enrollmentStatus: "APPROVED" },
      },
      select: { id: true },
      take: 1,
    });
  }
  if (targetAccounts.length === 0) redirect("/admin?notice=account");

  const senderName = safeSenderName(parsed.data.senderName);
  const sourceName = parsed.data.sourceName ? safeInstitutionName(parsed.data.sourceName) : "";
  const sourceLast4 = lastFourDigits(parsed.data.sourceLast4);
  const counterparty = [sourceName || null, sourceLast4 ? `•••• ${sourceLast4}` : null]
    .filter(Boolean)
    .join(" · ") || null;
  const reference = randomRef(parsed.data.paymentMethod === "ACH" ? "adminach" : "adminwire");
  await db.$transaction(async (tx) => {
    await tx.transaction.createMany({
      data: targetAccounts.map(({ id }) => ({
        accountId: id,
        amount,
        type: "DEPOSIT",
        category: "TRANSFER",
        description: senderName,
        counterparty,
        paymentMethod: parsed.data.paymentMethod,
        status: "PENDING_APPROVAL",
        reference,
        createdAt: activityDate,
      })),
    });
  });

  refreshApprovalViews();
  redirect("/admin?notice=credit-submitted");
}

export async function adminPauseHistoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const paused = String(formData.get("paused") ?? "") === "yes";
  if (!userId) redirect("/admin?notice=customer-unavailable");
  const result = await db.user.updateMany({
    where: { id: userId, role: "CUSTOMER" },
    data: {
      historyPaused: paused,
      historyPausedAt: paused ? new Date() : null,
      historyPausedById: paused ? admin.id : null,
    },
  });
  if (result.count !== 1) redirect("/admin?notice=customer-unavailable");
  refreshApprovalViews();
  redirect(paused ? "/admin?notice=history-paused" : "/admin?notice=history-resumed");
}

export async function adminLockUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const reason = String(formData.get("lockReason") ?? "").replace(/\s+/g, " ").trim();
  if (!userId) redirect("/admin?notice=customer-unavailable");
  if (userId === admin.id) redirect("/admin?notice=lock-self");
  if (reason.length < 8 || reason.length > 280) redirect("/admin?notice=lock-reason");
  if (formData.get("confirm") !== "yes") redirect("/admin?notice=lock-confirm");

  const result = await db.user.updateMany({
    where: { id: userId, role: "CUSTOMER", enrollmentStatus: "APPROVED" },
    data: {
      accessLocked: true,
      lockReason: reason,
      lockedById: admin.id,
      lockedAt: new Date(),
    },
  });
  if (result.count !== 1) redirect("/admin?notice=customer-unavailable");
  refreshApprovalViews();
  redirect("/admin?notice=locked");
}

export async function adminUnlockUserAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect("/admin?notice=customer-unavailable");
  const result = await db.user.updateMany({
    where: { id: userId, role: "CUSTOMER", accessLocked: true },
    data: {
      accessLocked: false,
      lockReason: null,
      lockedById: null,
      lockedAt: null,
    },
  });
  if (result.count !== 1) redirect("/admin?notice=customer-unavailable");
  refreshApprovalViews();
  redirect("/admin?notice=unlocked");
}

const PAIRED_REFERENCE = /^(trf_|pay_|req_|bp)/i;

async function rebuildAccountLedger(tx: { transaction: any; account: any }, accountId: string) {
  const rows = await tx.transaction.findMany({
    where: { accountId, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
  });
  let balance = 0;
  for (const row of rows) {
    balance += row.amount;
    await tx.transaction.update({ where: { id: row.id }, data: { balanceAfter: balance } });
  }
  await tx.account.update({ where: { id: accountId }, data: { balance } });
}

export async function adminDeleteActivityAction(formData: FormData) {
  await requireAdmin();
  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const returnAccount = String(formData.get("accountId") ?? "").trim();
  if (!transactionId) redirect("/admin?notice=activity-unavailable");
  if (formData.get("confirm") !== "yes") redirect(`/admin?notice=activity-confirm${returnAccount ? `&account=${returnAccount}` : ""}`);

  const selected = await db.transaction.findFirst({
    where: { id: transactionId },
    include: { account: { select: { id: true, userId: true } } },
  });
  if (!selected) redirect("/admin?notice=activity-unavailable");

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      const toDelete = selected.reference && PAIRED_REFERENCE.test(selected.reference)
        ? await tx.transaction.findMany({ where: { reference: selected.reference } })
        : [selected];
      if (toDelete.length === 0) throw new Error("ACTIVITY_UNAVAILABLE");

      const accountIds = [...new Set(toDelete.map((row: { accountId: string }) => row.accountId))];
      await tx.transaction.deleteMany({ where: { id: { in: toDelete.map((row: { id: string }) => row.id) } } });

      if (selected.reference) {
        await tx.billPayment.updateMany({
          where: { confirmationNumber: selected.reference, status: { not: "COMPLETED" } },
          data: { status: "CANCELED" },
        });
        await tx.moneyRequest.updateMany({
          where: { reference: selected.reference, status: { in: ["OPEN", "PENDING_APPROVAL"] } },
          data: { status: "CANCELED", updatedAt: now },
        });
      }

      for (const accountId of accountIds) await rebuildAccountLedger(tx, accountId);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVITY_UNAVAILABLE") redirect("/admin?notice=activity-unavailable");
    console.error("Admin activity delete failed", error);
    redirect("/admin?notice=error");
  }

  refreshApprovalViews();
  redirect(returnAccount ? `/admin?notice=activity-deleted&account=${returnAccount}` : "/admin?notice=activity-deleted");
}
