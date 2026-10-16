import { createHmac } from "node:crypto";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = path.resolve(process.cwd(), "screenshots");
mkdirSync(SHOTS, { recursive: true });

const results = [];
const db = new PrismaClient();

async function accountOwner(email) {
  return db.user.findUnique({ where: { email }, include: { accounts: { orderBy: { createdAt: "asc" } } } });
}

function balanceSnapshot(user) {
  return Object.fromEntries(user.accounts.map((account) => [account.id, account.balance]));
}

function snapshotsMatch(left, right) {
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([id, balance]) => right[id] === balance);
}

async function reviewGroup(adminPage, reference, action = "Approve and post", notice = "approved") {
  const group = adminPage.locator(`[data-group-key="ref:${reference}"]`);
  await group.getByRole("button", { name: action }).click();
  await group.waitFor({ state: "detached", timeout: 20000 });
  await adminPage.waitForURL(`**/admin?notice=${notice}`, { timeout: 20000 });
}

function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? ` — ${extra}` : ""}`);
}

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

const authenticatorSecrets = new Map();
const TOTP_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(secret) {
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const character of secret.toUpperCase()) {
    const value = TOTP_ALPHABET.indexOf(character);
    if (value < 0) throw new Error("Invalid test TOTP secret");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}

function currentTotp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24)
    | ((digest[offset + 1] & 255) << 16)
    | ((digest[offset + 2] & 255) << 8)
    | (digest[offset + 3] & 255);
  return String(value % 1_000_000).padStart(6, "0");
}

let mfaFinishCount = 0;
async function finishAuthenticator(page, email) {
  await page.waitForURL((url) => url.pathname === "/mfa/setup" || url.pathname === "/mfa/verify", { timeout: 20000 });
  const mfaPath = new URL(page.url()).pathname;
  const hadFullSession = (await page.context().cookies(BASE)).some((cookie) => cookie.name === "fmb_session_v2");
  if (mfaPath === "/mfa/verify") {
    const methodIds = ["mfa-method-authenticator", "mfa-method-sms", "mfa-method-email", "mfa-method-app-approval"];
    const methodsSelectable = (await Promise.all(methodIds.map(async (id) => {
      const option = page.getByTestId(id);
      return await option.count() === 1 && await option.isEnabled() && await option.getAttribute("aria-disabled") === null;
    }))).every(Boolean) && await page.getByText("Not enabled", { exact: true }).count() === 0;
    check("MFA method screen offers all four methods as selectable buttons", methodsSelectable);
    check("MFA screen shows no code form until a method is chosen", await page.locator('input[name="totpCode"]').count() === 0 && !(await page.context().cookies(BASE)).some((cookie) => cookie.name === "fmb_session_v2"));
    const contactUser = await db.user.findUnique({ where: { email }, select: { email: true, phone: true } });
    const digits = (contactUser?.phone ?? "").replace(/\D/g, "");
    const [localPart, domain] = (contactUser?.email ?? "@").split("@");
    const expectedMaskedEmail = `${localPart.length > 1 ? localPart[0] : ""}•••@${domain}`;
    const smsText = await page.getByTestId("mfa-method-sms").innerText();
    const emailText = await page.getByTestId("mfa-method-email").innerText();
    const phoneOk = digits.length >= 8 ? smsText.includes(`Phone ending in ${digits.slice(-4)}`) : smsText.includes("No phone number registered");
    check(`MFA screen shows ${email}'s own masked phone and email`, phoneOk && emailText.includes(expectedMaskedEmail) && !/last four digits/i.test(emailText));
    // page.content() includes the serialized Next.js payload, so this also catches props leaking.
    const pageHtml = await page.content();
    const leaks = [contactUser?.email, contactUser?.phone, digits.length >= 8 ? digits : null].filter(Boolean);
    check(`MFA screen does not expose ${email}'s full contact details`, leaks.every((value) => !pageHtml.includes(value)));
    const screenText = await page.locator("main, body").first().innerText();
    check("MFA method screen uses generic Authenticator wording without the reset banner", screenText.includes("Enter the six-digit code from Authenticator.") && !screenText.includes("If you lose access to your authenticator, contact an administrator for a reset") && !screenText.includes("Google Authenticator") && !/code (was|has been) sent/i.test(screenText));

    // Every selection shows its own masked method, but only the authenticator code is verified.
    const selectionPaths = [
      { id: "mfa-method-sms", selected: digits.length >= 8 ? `Text message to phone ending in ${digits.slice(-4)}` : "Text message to phone (No phone number registered)", instructions: "Enter the six-digit code from your phone to verify." },
      { id: "mfa-method-email", selected: `Email code to ${expectedMaskedEmail}`, instructions: "Enter the six-digit code from your email to verify." },
      { id: "mfa-method-app-approval", selected: "Approve in First Meridian app", instructions: "Enter the current six-digit code from your account to verify your sign-in." },
    ];
    let selectionPathsOk = true;
    for (const path of selectionPaths) {
      await page.getByTestId(path.id).click();
      await page.getByLabel("Six-digit authenticator code").waitFor();
      const noticeText = await page.getByTestId("mfa-verification-notice").innerText();
      selectionPathsOk &&= await page.getByRole("heading", { name: "Verify your sign-in" }).isVisible()
        && noticeText.includes(`You selected: ${path.selected}`)
        && noticeText.includes(path.instructions)
        && !noticeText.includes("This demo does not send")
        && !noticeText.includes("Google Authenticator")
        && await page.getByRole("button", { name: "Back to verification methods" }).isVisible()
        && !(await page.context().cookies(BASE)).some((cookie) => cookie.name === "fmb_session_v2")
        && new URL(page.url()).pathname === "/mfa/verify";
      await page.getByRole("button", { name: "Back to verification methods" }).click();
      await page.getByTestId("mfa-method-sms").waitFor();
      selectionPathsOk &&= await page.locator('input[name="totpCode"]').count() === 0;
    }
    check("Each MFA selection shows its own option, Back works, and selection alone never signs in", selectionPathsOk);
    // Finish through a rotating method so each path also gets a real successful verification.
    const finishingMethod = ["mfa-method-sms", "mfa-method-email", "mfa-method-app-approval", "mfa-method-authenticator"][mfaFinishCount++ % 4];
    await page.getByTestId(finishingMethod).click();
    await page.getByLabel("Six-digit authenticator code").waitFor();
    const htmlAfterSelect = await page.content();
    check(`MFA authenticator step still does not expose ${email}'s full contact details`, leaks.every((value) => !htmlAfterSelect.includes(value)));
  }
  let secret = authenticatorSecrets.get(email);
  if (mfaPath === "/mfa/setup") {
    secret = (await page.getByTestId("totp-secret").innerText()).trim();
    authenticatorSecrets.set(email, secret);
  } else {
    const user = await db.user.findUnique({ where: { email }, select: { totpLastUsedStep: true } });
    const deadline = Date.now() + 35_000;
    while (user && user.totpLastUsedStep !== null && Math.floor(Date.now() / 30000) <= user.totpLastUsedStep && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!secret) throw new Error(`No test authenticator is available for ${email}`);
  await page.locator('input[name="totpCode"]').fill(currentTotp(secret));
  await page.getByRole("button", { name: mfaPath === "/mfa/setup" ? "Verify and enable authenticator" : "Verify and sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { mfaPath, hadFullSession };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);

  /* ---------------- LANDING ---------------- */
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("text=checking account");
  check("Landing page renders hero", true);
  await shot(page, "01-landing");

  /* ---------------- LOGIN ---------------- */
  // Simulate an old browser cookie from the pre-partitioned session implementation.
  await page.context().addCookies([{ name: "fmb_session", value: "stale-invalid-session", url: BASE }]);
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.waitForSelector("text=Sign in to Online Banking");
  await page.getByText("Forgot your passcode?", { exact: true }).click();
  await page.getByText("Contact customer service if you need help resetting your passcode.", { exact: true }).waitFor();
  check("Forgot-passcode control explains how to get reset help", true);
  const loginPassword = page.locator('input[name="password"]');
  check("Login passcode is hidden by default", await loginPassword.getAttribute("type") === "password");
  await loginPassword.fill("wrongpass");
  const loginToggle = page.getByRole("button", { name: "Show password" });
  await loginToggle.focus();
  check("Password toggle shows a visible keyboard focus ring", (await loginToggle.evaluate((el) => getComputedStyle(el).boxShadow)) !== "none");
  await page.keyboard.press("Enter");
  check("Password toggle reveals the password without submitting or clearing it", await loginPassword.getAttribute("type") === "text" && await loginPassword.inputValue() === "wrongpass" && new URL(page.url()).pathname === "/login" && await page.getByRole("button", { name: "Hide password" }).count() === 1);
  await page.getByRole("button", { name: "Hide password" }).click();
  check("Password toggle hides it again", await loginPassword.getAttribute("type") === "password");
  await page.fill('input[name="username"]', "demo@vela.app");
  await page.fill('input[name="password"]', "wrongpass");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=The User ID or passcode you entered is incorrect");
  check("Login rejects bad password with error", true);

  await page.fill('input[name="username"]', "demo@vela.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  const firstMfa = await finishAuthenticator(page, "demo@vela.app");
  check("Authenticator enrollment is required before a full session is issued", firstMfa.mfaPath === "/mfa/setup" && !firstMfa.hadFullSession);
  await page.waitForSelector("text=Account Summary");
  const cookieJar = await page.context().cookies(BASE);
  check("Login creates the partitioned session cookie", cookieJar.some((cookie) => cookie.name === "fmb_session_v2"));
  check("Login removes the legacy cookie that could shadow the session", !cookieJar.some((cookie) => cookie.name === "fmb_session"));
  await page.getByRole("link", { name: "Transfers", exact: true }).click();
  await page.waitForURL("**/transfer");
  const stillSignedIn = await page.locator("body").innerText();
  check("Protected navigation keeps the user signed in", stillSignedIn.includes("Welcome, Amara"));
  check("Customer navigation does not expose admin approvals", await page.getByRole("link", { name: "Admin approvals" }).count() === 0);
  await page.goto(`${BASE}/admin`, { waitUntil: "load" });
  await page.waitForURL("**/dashboard?notice=admin-only");
  check("Shared customer cannot open the admin approval page", await page.locator("main").innerText().then((text) => !text.includes("Transactions awaiting approval")));
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await page.waitForURL("**/help");
  await page.getByRole("heading", { name: "Common questions" }).waitFor({ state: "visible" });
  check("Help page is available while signed in", true);
  await page.getByRole("link", { name: "Accounts Overview" }).click();
  await page.waitForURL("**/dashboard");
  await page.waitForSelector("text=Account Summary");
  const dashText = await page.locator("main").innerText();
  check("Login + redirect to dashboard", true);
  check("Dashboard shows account summary", dashText.includes("Account Summary") && dashText.includes("Banking accounts"));
  check("Dashboard shows recent activity", dashText.toLowerCase().includes("recent account activity"));
  check("Dashboard shows categories chart", dashText.includes("Spending by category"));
  await shot(page, "02-dashboard");

  /* ---------------- MOBILE BANKING HOME ---------------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  check("Mobile banking dock is visible", await page.getByRole("navigation", { name: "Mobile banking" }).isVisible());
  const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check("Mobile account home has no horizontal overflow", mobileWidth);
  check("Mobile home has monthly insights after activity", await page.getByRole("heading", { name: "This month" }).isVisible());
  check("Mobile home includes spending and quick links", await page.getByRole("heading", { name: "Spending by category" }).isVisible() && await page.getByRole("heading", { name: "Quick links" }).isVisible());
  check("Mobile footer shows the First Meridian Bank footer", (await page.locator("footer").filter({ hasText: "First Meridian Bank" }).last().innerText()).includes("© 2026 First Meridian Bank"));
  check("Mobile header has no easy-to-mistap sign-out", await page.getByRole("button", { name: "Sign out", exact: true }).count() === 0);
  await shot(page, "02b-mobile-dashboard");
  await page.getByRole("button", { name: "Services" }).click();
  await page.waitForSelector("text=Menu & services");
  const mobileMenu = page.getByRole("dialog", { name: "More banking services" });
  check("Mobile Services menu opens", await mobileMenu.getByRole("link", { name: "Deposit a check" }).isVisible() && await mobileMenu.getByRole("link", { name: "Receive money" }).isVisible());
  await mobileMenu.getByRole("link", { name: "Pay bills" }).click();
  await page.waitForURL("**/bill-pay");
  await page.getByRole("heading", { name: "Bill Pay" }).waitFor({ state: "visible" });
  check("Mobile menu routes to Bill Pay", true);

  // The bottom Deposit item opens the capture-first mobile check deposit flow.
  await page.getByRole("link", { name: "Deposit" }).click();
  await page.waitForURL("**/mobile-deposit");
  await page.getByRole("heading", { name: "Mobile deposit" }).waitFor({ state: "visible" });
  const mobileBalanceBefore = balanceSnapshot(await accountOwner("demo@vela.app"));
  await page.fill('input[name="amount"]', "12.50");
  await page.fill('input[name="checkNumber"]', "1042");
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lMcAAAAASUVORK5CYII=", "base64");
  const image = { name: "sample-check.png", mimeType: "image/png", buffer: tinyPng };
  await page.locator('input[type="file"]').nth(0).setInputFiles(image);
  await page.locator('input[type="file"]').nth(1).setInputFiles(image);
  await page.getByRole("button", { name: "Review mobile deposit" }).click();
  await page.getByRole("heading", { name: "Review your mobile deposit" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Submit deposit" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/transactions/"), { timeout: 20000 });
  await page.getByRole("heading", { name: "Transaction receipt" }).waitFor({ state: "visible" });
  const mobileTx = await db.transaction.findFirst({ where: { description: "Mobile check deposit", status: "PENDING_APPROVAL", account: { user: { email: "demo@vela.app" } } }, orderBy: { createdAt: "desc" } });
  const mobileBalanceAfter = balanceSnapshot(await accountOwner("demo@vela.app"));
  check("Mobile deposit waits for approval before changing the balance", Boolean(mobileTx) && snapshotsMatch(mobileBalanceBefore, mobileBalanceAfter) && (await page.locator("main").innerText()).includes("Processing"));
  await page.getByRole("button", { name: "Open menu" }).click();
  const topMenu = page.getByRole("dialog", { name: "More banking services" });
  await topMenu.getByRole("link", { name: "All services" }).click();
  await page.waitForURL("**/services");
  check("Top-left Menu opens the complete services directory", (await page.locator("main").innerText()).includes("Mobile deposit") && (await page.locator("main").innerText()).includes("Receive money"));
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ---------------- DEPOSIT ---------------- */
  await page.goto(`${BASE}/transfer?tab=deposit`, { waitUntil: "load" });
  if (!(await page.getByRole("button", { name: "Submit deposit request" }).count())) {
    await page.getByText("Use another deposit method", { exact: true }).click();
  }
  const internalDepositForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Submit deposit request" }) });
  await internalDepositForm.locator('input[name="amount"]').waitFor({ state: "visible" });
  const depositBalanceBefore = balanceSnapshot(await accountOwner("demo@vela.app"));
  await internalDepositForm.locator('input[name="amount"]').fill("250.00");
  await internalDepositForm.getByRole("button", { name: "Submit deposit request" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/transactions/"), { timeout: 20000 });
  const depositReceipt = await page.locator("main").innerText();
  const depositTx = await db.transaction.findFirst({ where: { description: "Deposit", status: "PENDING_APPROVAL", account: { user: { email: "demo@vela.app" } } }, orderBy: { createdAt: "desc" } });
  const depositBalanceAfter = balanceSnapshot(await accountOwner("demo@vela.app"));
  check("Deposit request stays unposted until approval", Boolean(depositTx) && snapshotsMatch(depositBalanceBefore, depositBalanceAfter) && depositReceipt.includes("Processing"));
  await shot(page, "03-deposit-request");

  /* ---------------- INTERNAL TRANSFER ---------------- */
  await page.goto(`${BASE}/transfer?tab=transfer`, { waitUntil: "load" });
  await page.waitForSelector('input[name="amount"]');
  const transferBalanceBefore = balanceSnapshot(await accountOwner("demo@vela.app"));
  await page.fill('input[name="amount"]', "100.00");
  await page.fill('input[name="memo"]', "E2E savings sweep");
  await page.click('button:has-text("Review transfer")');
  await page.waitForSelector("text=Review this transfer");
  check("Internal transfer opens a review step", true);
  await page.getByRole("button", { name: "Submit transfer" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/transactions/"), { timeout: 20000 });
  const transferRows = await db.transaction.findMany({ where: { description: "E2E savings sweep", status: "PENDING_APPROVAL", account: { user: { email: "demo@vela.app" } } } });
  const transferBalanceAfter = balanceSnapshot(await accountOwner("demo@vela.app"));
  check("Internal transfer keeps both balances unchanged pending approval", transferRows.length === 2 && transferRows[0].reference === transferRows[1].reference && snapshotsMatch(transferBalanceBefore, transferBalanceAfter));

  /* ---------------- P2P SEND ---------------- */
  await page.goto(`${BASE}/transfer?tab=send`, { waitUntil: "load" });
  await page.waitForSelector('input[name="recipientEmail"]');
  const quickPayBalanceBefore = {
    amara: balanceSnapshot(await accountOwner("demo@vela.app")),
    marcus: balanceSnapshot(await accountOwner("marcus@example.com")),
  };
  await page.fill('input[name="recipientEmail"]', "marcus@example.com");
  await page.fill('input[name="amount"]', "25.00");
  await page.fill('input[name="memo"]', "E2E lunch split");
  await page.click('button:has-text("Review Quick Pay")');
  await page.waitForSelector("text=Review your Quick Pay");
  check("Quick Pay opens a recipient review step", true);
  await page.getByRole("button", { name: "Send Quick Pay" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/transactions/"), { timeout: 20000 });
  const quickPayRows = await db.transaction.findMany({ where: { description: "E2E lunch split", status: "PENDING_APPROVAL" } });
  const quickPayBalanceAfter = {
    amara: balanceSnapshot(await accountOwner("demo@vela.app")),
    marcus: balanceSnapshot(await accountOwner("marcus@example.com")),
  };
  check("Quick Pay records linked entries without changing either balance", quickPayRows.length === 2 && quickPayRows[0].reference === quickPayRows[1].reference && snapshotsMatch(quickPayBalanceBefore.amara, quickPayBalanceAfter.amara) && snapshotsMatch(quickPayBalanceBefore.marcus, quickPayBalanceAfter.marcus));

  /* ---------------- RECEIVE / REQUEST MONEY ---------------- */
  await page.goto(`${BASE}/receive`, { waitUntil: "load" });
  await page.fill('input[name="recipientEmail"]', "marcus@example.com");
  await page.fill('input[name="amount"]', "15.25");
  await page.fill('input[name="memo"]', "E2E receive request");
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("heading", { name: "Review your request" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Send request" }).click();
  await page.waitForURL("**/receive?notice=requested");
  await page.getByText("Request sent", { exact: true }).waitFor({ state: "visible" });
  await page.getByText("$15.25", { exact: false }).waitFor({ state: "visible" });
  const requestCreatedText = await page.locator("main").innerText();
  check("Receive Money creates a review-confirmed request", requestCreatedText.includes("Request sent") && requestCreatedText.includes("$15.25"));

  const marcusPage = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await marcusPage.goto(`${BASE}/login`, { waitUntil: "load" });
  await marcusPage.fill('input[name="username"]', "marcus@example.com");
  await marcusPage.fill('input[name="password"]', "demo1234");
  await marcusPage.click('button[type="submit"]');
  const marcusMfa = await finishAuthenticator(marcusPage, "marcus@example.com");
  check("Second user must enroll a separate authenticator", marcusMfa.mfaPath === "/mfa/setup" && !marcusMfa.hadFullSession);
  await marcusPage.goto(`${BASE}/receive`, { waitUntil: "load" });
  const requestPayBalancesBefore = {
    amara: balanceSnapshot(await accountOwner("demo@vela.app")),
    marcus: balanceSnapshot(await accountOwner("marcus@example.com")),
  };
  await marcusPage.getByRole("button", { name: "Submit payment" }).waitFor({ state: "visible" });
  await marcusPage.getByLabel("My balance updates when the payment is processed.").check();
  await marcusPage.getByRole("button", { name: "Submit payment" }).click();
  await marcusPage.waitForURL((url) => url.pathname.startsWith("/transactions/"), { timeout: 20000 });
  const requestPayment = await db.moneyRequest.findFirst({ where: { recipient: { email: "marcus@example.com" }, requester: { email: "demo@vela.app" }, status: "PENDING_APPROVAL" }, orderBy: { createdAt: "desc" } });
  const requestPaymentRows = requestPayment ? await db.transaction.findMany({ where: { reference: requestPayment.reference, status: "PENDING_APPROVAL" } }) : [];
  const requestPayBalancesAfter = {
    amara: balanceSnapshot(await accountOwner("demo@vela.app")),
    marcus: balanceSnapshot(await accountOwner("marcus@example.com")),
  };
  check("Paying a money request waits for approval on both accounts", Boolean(requestPayment) && requestPaymentRows.length === 2 && snapshotsMatch(requestPayBalancesBefore.amara, requestPayBalancesAfter.amara) && snapshotsMatch(requestPayBalancesBefore.marcus, requestPayBalancesAfter.marcus));
  await page.goto(`${BASE}/receive`, { waitUntil: "load" });
  check("Requester sees the payment processing", (await page.locator("main").innerText()).includes("Processing"));

  /* ---------------- BILL PAY ---------------- */
  await page.goto(`${BASE}/bill-pay`, { waitUntil: "load" });
  await page.waitForSelector('select[name="payeeId"]');
  await page.click('button:has-text("Add company")');
  await page.fill('input[name="name"]', "E2E City Water");
  await page.selectOption('select[name="category"]', "UTILITIES");
  await page.fill('input[name="accountNumber"]', "acct123456");
  await page.click('button:has-text("Save company")');
  await page.waitForSelector("text=E2E City Water was added to your biller list.");
  check("Bill Pay saves a biller with a masked account reference", true);
  await page.fill('input[name="amount"]', "35.75");
  await page.fill('input[name="memo"]', "E2E electric bill");
  await page.click('button:has-text("Review payment")');
  await page.waitForSelector("text=Review your bill payment");
  check("Bill Pay shows a review before scheduling", true);
  const billPayBalanceBefore = balanceSnapshot(await accountOwner("demo@vela.app"));
  await page.getByRole("button", { name: "Submit payment" }).click();
  await page.waitForURL((url) => /^\/transactions\//.test(url.pathname), { timeout: 20000 });
  await page.getByRole("heading", { name: "Transaction receipt" }).waitFor({ state: "visible" });
  const billText = await page.locator("main").innerText();
  const billPayment = await db.billPayment.findFirst({ where: { user: { email: "demo@vela.app" }, memo: "E2E electric bill" }, orderBy: { createdAt: "desc" } });
  const billTransaction = billPayment ? await db.transaction.findFirst({ where: { reference: billPayment.confirmationNumber } }) : null;
  const billPayBalanceAfter = balanceSnapshot(await accountOwner("demo@vela.app"));
  check("Bill Pay stays unposted until approved and retains the scheduled details", Boolean(billPayment) && billPayment.status === "PENDING_APPROVAL" && billTransaction?.status === "PENDING_APPROVAL" && snapshotsMatch(billPayBalanceBefore, billPayBalanceAfter) && billText.includes("E2E electric bill") && billText.includes("Bill Pay") && billText.includes("Payment processing."));

  // Save an external destination; only the last four digits should be retained.
  await page.goto(`${BASE}/linked-accounts`, { waitUntil: "load" });
  await page.fill('input[name="institutionName"]', "E2E Example Bank");
  await page.fill('input[name="nickname"]', "27361891296");
  await page.selectOption('select[name="accountType"]', "CHECKING");
  await page.fill('input[name="accountNumber"]', "27361891296");
  await page.fill('input[name="routingNumber"]', "021000021");
  await page.getByRole("button", { name: "Save external account" }).click();
  await page.getByText(/Use a nickname only/).waitFor({ state: "visible" });
  check("External account form rejects account-number-like nicknames", true);
  await page.fill('input[name="institutionName"]', "E2E Example Bank");
  await page.fill('input[name="nickname"]', "E2E checking");
  await page.selectOption('select[name="accountType"]', "CHECKING");
  await page.fill('input[name="accountNumber"]', "27361891296");
  await page.fill('input[name="routingNumber"]', "021000021");
  await page.getByRole("button", { name: "Save external account" }).click();
  await page.getByText("E2E checking", { exact: false }).last().waitFor({ state: "visible" });
  const externalDestination = await db.externalAccount.findFirst({ where: { user: { email: "demo@vela.app" }, nickname: "E2E checking" } });
  const destinationText = await page.locator("main").innerText();
  check("New external account stores only last four digits and awaits review", Boolean(externalDestination) && externalDestination.status === "PENDING_APPROVAL" && externalDestination.accountMask === "1296" && destinationText.includes("E2E Example Bank") && destinationText.includes("1296") && destinationText.toLowerCase().includes("being processed") && !destinationText.includes("27361891296") && !destinationText.includes("021000021"), JSON.stringify({ status: externalDestination?.status, mask: externalDestination?.accountMask, text: destinationText }));

  await page.goto(`${BASE}/transfer?tab=withdraw`, { waitUntil: "load" });
  await page.getByText("Verification is still in progress", { exact: true }).waitFor();
  check("Unverified external destinations cannot be selected for withdrawal", await page.locator('select[name="externalAccountId"]').count() === 0);

  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  adminPage.setDefaultTimeout(20000);
  await adminPage.goto(`${BASE}/login`, { waitUntil: "load" });
  await adminPage.fill('input[name="username"]', "e2e-admin@example.test");
  await adminPage.fill('input[name="password"]', "e2e-admin-pass-82");
  await adminPage.click('button[type="submit"]');
  const adminMfa = await finishAuthenticator(adminPage, "e2e-admin@example.test");
  check("Separate admin also needs authenticator setup", adminMfa.mfaPath === "/mfa/setup" && !adminMfa.hadFullSession);
  check("Separate admin account can sign in", await adminPage.getByRole("link", { name: "Admin approvals", exact: true }).isVisible());
  await adminPage.getByRole("link", { name: "Admin approvals", exact: true }).click();
  await adminPage.waitForURL("**/admin");
  const externalReview = adminPage.locator("article").filter({ hasText: "E2E checking" });
  await externalReview.getByRole("button", { name: "Start verification challenge" }).click();
  await adminPage.waitForURL("**/admin?notice=challenge-issued", { timeout: 20000 });
  const challenge = await db.externalAccount.findUnique({ where: { id: externalDestination.id } });
  const adminChallengeText = await adminPage.locator("article").filter({ hasText: "E2E checking" }).innerText();
  check("Admin starts a verification challenge", challenge?.status === "CHALLENGE_ACTIVE" && challenge.microdepositAmount1 !== null && challenge.microdepositAmount2 !== null && challenge.microdepositAmount1 !== challenge.microdepositAmount2 && adminChallengeText.includes("Verification amounts"));

  await page.goto(`${BASE}/linked-accounts`, { waitUntil: "load" });
  const customerChallengeCard = page.locator("article").filter({ hasText: "E2E checking" });
  const customerChallengeText = await customerChallengeCard.innerText();
  const expectedFirst = challenge?.microdepositAmount1 ?? 0;
  const expectedSecond = challenge?.microdepositAmount2 ?? 0;
  const dollars = (cents) => (cents / 100).toFixed(2);
  check("Customer sees a verification form without the hidden challenge values", customerChallengeText.includes("Enter the two small deposit amounts associated with this account") && !customerChallengeText.includes("Verification amounts:") && await customerChallengeCard.locator('input[name="microdepositAmount1"]').inputValue() === "" && await customerChallengeCard.locator('input[name="microdepositAmount2"]').inputValue() === "");
  const wrongFirst = expectedFirst === 99 ? 98 : expectedFirst + 1;
  await page.locator("article").filter({ hasText: "E2E checking" }).getByLabel("First amount").fill(dollars(wrongFirst));
  await page.locator("article").filter({ hasText: "E2E checking" }).getByLabel("Second amount").fill(dollars(expectedSecond));
  await page.locator("article").filter({ hasText: "E2E checking" }).getByRole("button", { name: "Verify" }).click();
  await page.getByText("Those amounts didn't match", { exact: false }).waitFor();
  const afterWrongAmount = await db.externalAccount.findUnique({ where: { id: externalDestination.id } });
  check("Wrong amounts count as an attempt but do not verify the destination", afterWrongAmount?.status === "CHALLENGE_ACTIVE" && afterWrongAmount.microdepositAttempts === 1);
  await page.reload({ waitUntil: "load" });
  await page.locator("article").filter({ hasText: "E2E checking" }).getByLabel("First amount").fill(dollars(expectedFirst));
  await page.locator("article").filter({ hasText: "E2E checking" }).getByLabel("Second amount").fill(dollars(expectedSecond));
  await page.locator("article").filter({ hasText: "E2E checking" }).getByRole("button", { name: "Verify" }).click();
  await page.waitForSelector("text=Verified", { timeout: 20000 });
  const verifiedDestination = await db.externalAccount.findUnique({ where: { id: externalDestination.id } });
  check("Correct amounts verify the destination and erase the challenge values", verifiedDestination?.status === "VERIFIED" && verifiedDestination.microdepositAmount1 === null && verifiedDestination.microdepositAmount2 === null && verifiedDestination.microdepositAttempts === 0);

  // Insufficient funds are still blocked at submission time.
  await page.goto(`${BASE}/transfer?tab=withdraw`, { waitUntil: "load" });
  await page.selectOption('select[name="externalAccountId"]', { label: "E2E checking · E2E Example Bank · •••• 1296" });
  await page.fill('input[name="amount"]', "99999.99");
  await page.getByRole("button", { name: "Review external transfer" }).click();
  await page.getByText("Review external transfer", { exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Submit transfer" }).click();
  await page.waitForSelector("text=Insufficient funds", { timeout: 20000 });
  check("External withdrawal blocks an amount above the available balance", true);
  await shot(page, "04-move-money-error");

  const withdrawalBalanceBefore = balanceSnapshot(await accountOwner("demo@vela.app"));
  await page.goto(`${BASE}/transfer?tab=withdraw`, { waitUntil: "load" });
  await page.selectOption('select[name="externalAccountId"]', { label: "E2E checking · E2E Example Bank · •••• 1296" });
  await page.fill('input[name="amount"]', "10.50");
  await page.getByRole("button", { name: "Review external transfer" }).click();
  await page.getByText("Review external transfer", { exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Submit transfer" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/transactions/"), { timeout: 20000 });
  await page.getByRole("heading", { name: "External transfer receipt" }).waitFor({ state: "visible" });
  const externalReceipt = await page.locator("main").innerText();
  const achWithdrawal = await db.transaction.findFirst({ where: { type: "WITHDRAWAL", paymentMethod: "ACH", status: "PENDING_APPROVAL", account: { user: { email: "demo@vela.app" } }, amount: -1050 }, orderBy: { createdAt: "desc" } });
  const withdrawalBalanceAfter = balanceSnapshot(await accountOwner("demo@vela.app"));
  check("ACH withdrawal awaits approval, leaves balance unchanged and masks details", Boolean(achWithdrawal) && snapshotsMatch(withdrawalBalanceBefore, withdrawalBalanceAfter) && externalReceipt.includes("ACH") && externalReceipt.includes("Processing") && externalReceipt.includes("External transfer record") && !externalReceipt.includes("27361891296") && !externalReceipt.includes("021000021"));

  await page.goto(`${BASE}/transfer?tab=withdraw`, { waitUntil: "load" });
  await page.selectOption('select[name="externalAccountId"]', { label: "E2E checking · E2E Example Bank · •••• 1296" });
  await page.selectOption('select[name="paymentMethod"]', "WIRE");
  await page.fill('input[name="amount"]', "7.25");
  await page.getByRole("button", { name: "Review external transfer" }).click();
  await page.getByRole("button", { name: "Submit transfer" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/transactions/"), { timeout: 20000 });
  const wireReceipt = await page.locator("main").innerText();
  check("Wire option creates a pending external transfer request", wireReceipt.includes("Wire") && wireReceipt.includes("Processing") && wireReceipt.includes("External transfer record"));

  /* ---------------- ADMIN APPROVALS ---------------- */
  const balancesBeforeAdmin = {
    amara: balanceSnapshot(await accountOwner("demo@vela.app")),
    marcus: balanceSnapshot(await accountOwner("marcus@example.com")),
  };
  check("All submitted balance-changing requests remain unposted before review", snapshotsMatch(mobileBalanceBefore, balancesBeforeAdmin.amara) && snapshotsMatch(quickPayBalanceBefore.marcus, balancesBeforeAdmin.marcus));

  await adminPage.goto(`${BASE}/admin`, { waitUntil: "load" });
  await adminPage.getByRole("heading", { name: "Admin approvals" }).waitFor({ state: "visible" });
  const initialQueueCount = await adminPage.getByTestId("approval-group").count();
  check("Admin approval page lists submitted requests", initialQueueCount >= 8);
  await shot(adminPage, "13-admin-approval-queue");

  const depositForApproval = await db.transaction.findFirst({ where: { description: "Deposit", account: { user: { email: "demo@vela.app" } }, status: "PENDING_APPROVAL" }, orderBy: { createdAt: "desc" } });
  const depositAccountBeforeApproval = depositForApproval ? await db.account.findUnique({ where: { id: depositForApproval.accountId } }) : null;
  if (depositForApproval) await reviewGroup(adminPage, depositForApproval.reference);
  const depositAccountAfterApproval = depositForApproval ? await db.account.findUnique({ where: { id: depositForApproval.accountId } }) : null;
  const approvedDeposit = depositForApproval ? await db.transaction.findUnique({ where: { id: depositForApproval.id } }) : null;
  check("Admin approval posts a deposit exactly once", Boolean(depositForApproval && depositAccountBeforeApproval && depositAccountAfterApproval && approvedDeposit?.status === "COMPLETED" && depositAccountAfterApproval.balance === depositAccountBeforeApproval.balance + 25000 && approvedDeposit.balanceAfter === depositAccountAfterApproval.balance));

  const transferForApproval = await db.transaction.findFirst({ where: { description: "E2E savings sweep", status: "PENDING_APPROVAL" } });
  const transferRowsBeforeApproval = transferForApproval ? await db.transaction.findMany({ where: { reference: transferForApproval.reference } }) : [];
  const transferAccountBalances = transferRowsBeforeApproval.length === 2 ? Object.fromEntries(await Promise.all(transferRowsBeforeApproval.map(async (row) => [row.accountId, (await db.account.findUnique({ where: { id: row.accountId } }))?.balance]))) : {};
  if (transferForApproval) await reviewGroup(adminPage, transferForApproval.reference);
  const transferRowsAfterApproval = transferForApproval ? await db.transaction.findMany({ where: { reference: transferForApproval.reference } }) : [];
  const transferAccountBalancesAfter = transferRowsBeforeApproval.length === 2 ? Object.fromEntries(await Promise.all(transferRowsBeforeApproval.map(async (row) => [row.accountId, (await db.account.findUnique({ where: { id: row.accountId } }))?.balance]))) : {};
  const transferDelta = transferRowsBeforeApproval.reduce((sum, row) => sum + row.amount, 0);
  const transferApproved = transferRowsBeforeApproval.length === 2 && transferRowsAfterApproval.every((row) => row.status === "COMPLETED") && transferDelta === 0 && Object.entries(transferAccountBalances).every(([id, balance]) => transferAccountBalancesAfter[id] === balance + transferRowsBeforeApproval.find((row) => row.accountId === id).amount);
  check("Admin approves linked internal-transfer legs together", transferApproved, JSON.stringify({ before: transferRowsBeforeApproval.map(({ accountId, amount, status }) => ({ accountId, amount, status })), after: transferRowsAfterApproval.map(({ accountId, amount, status }) => ({ accountId, amount, status })), balances: [transferAccountBalances, transferAccountBalancesAfter] }));

  const quickPayReference = quickPayRows[0]?.reference;
  if (quickPayReference) await reviewGroup(adminPage, quickPayReference);
  const approvedQuickPayRows = quickPayReference ? await db.transaction.findMany({ where: { reference: quickPayReference } }) : [];
  check("Admin approval posts both Quick Pay account entries", approvedQuickPayRows.length === 2 && approvedQuickPayRows.every((row) => row.status === "COMPLETED"), JSON.stringify(approvedQuickPayRows.map(({ amount, status, reference }) => ({ amount, status, reference }))));

  if (requestPayment) await reviewGroup(adminPage, requestPayment.reference);
  const paidMoneyRequest = requestPayment ? await db.moneyRequest.findUnique({ where: { id: requestPayment.id } }) : null;
  const completedRequestEntries = requestPayment ? await db.transaction.findMany({ where: { reference: requestPayment.reference } }) : [];
  check("Approved money request updates status and posts paired entries", paidMoneyRequest?.status === "PAID" && paidMoneyRequest.paidAt instanceof Date && completedRequestEntries.length === 2 && completedRequestEntries.every((row) => row.status === "COMPLETED"), JSON.stringify({ status: paidMoneyRequest?.status, paidAt: paidMoneyRequest?.paidAt, rows: completedRequestEntries.map(({ amount, status }) => ({ amount, status })) }));

  const mobileForApproval = await db.transaction.findFirst({ where: { description: "Mobile check deposit", status: "PENDING_APPROVAL", account: { user: { email: "demo@vela.app" } } }, orderBy: { createdAt: "desc" } });
  if (mobileForApproval) await reviewGroup(adminPage, mobileForApproval.reference);
  const approvedMobile = mobileForApproval ? await db.transaction.findUnique({ where: { id: mobileForApproval.id } }) : null;
  check("Admin approval posts a mobile deposit", approvedMobile?.status === "COMPLETED" && approvedMobile.amount === 1250, JSON.stringify({ status: approvedMobile?.status, amount: approvedMobile?.amount }));

  if (billPayment) await reviewGroup(adminPage, billPayment.confirmationNumber);
  const approvedBillPayment = billPayment ? await db.billPayment.findUnique({ where: { id: billPayment.id } }) : null;
  const approvedBillTransaction = billPayment ? await db.transaction.findFirst({ where: { reference: billPayment.confirmationNumber } }) : null;
  check("Admin approval updates Bill Pay and posts its debit", approvedBillPayment?.status === "SCHEDULED" && approvedBillTransaction?.status === "COMPLETED", JSON.stringify({ payment: approvedBillPayment?.status, transaction: approvedBillTransaction?.status, reference: approvedBillTransaction?.reference }));

  const achForApproval = await db.transaction.findFirst({ where: { type: "WITHDRAWAL", paymentMethod: "ACH", status: "PENDING_APPROVAL", account: { user: { email: "demo@vela.app" } }, amount: -1050 }, orderBy: { createdAt: "desc" } });
  if (achForApproval) await reviewGroup(adminPage, achForApproval.reference);
  const approvedAch = achForApproval ? await db.transaction.findUnique({ where: { id: achForApproval.id } }) : null;
  check("Admin approval posts an external ACH request", approvedAch?.status === "COMPLETED" && approvedAch.amount === -1050, JSON.stringify({ status: approvedAch?.status, amount: approvedAch?.amount }));

  const wireForRejection = await db.transaction.findFirst({ where: { type: "WITHDRAWAL", paymentMethod: "WIRE", status: "PENDING_APPROVAL", account: { user: { email: "demo@vela.app" } }, amount: -725 }, orderBy: { createdAt: "desc" } });
  const wireBalanceBeforeReject = wireForRejection ? await db.account.findUnique({ where: { id: wireForRejection.accountId } }) : null;
  if (wireForRejection) await reviewGroup(adminPage, wireForRejection.reference, "Reject", "rejected");
  const wireAfterReject = wireForRejection ? await db.transaction.findUnique({ where: { id: wireForRejection.id } }) : null;
  const wireBalanceAfterReject = wireForRejection ? await db.account.findUnique({ where: { id: wireForRejection.accountId } }) : null;
  check("Rejected wire request does not change the account balance", wireAfterReject?.status === "REJECTED" && wireBalanceBeforeReject?.balance === wireBalanceAfterReject?.balance, JSON.stringify({ status: wireAfterReject?.status, before: wireBalanceBeforeReject?.balance, after: wireBalanceAfterReject?.balance }));

  const marcusChecking = (await accountOwner("marcus@example.com")).accounts.find((account) => account.type === "CHECKING");
  const marcusBalanceBeforeCredit = marcusChecking?.balance;
  await adminPage.selectOption('select[name="recipient"]', marcusChecking.id);
  await adminPage.selectOption('select[name="paymentMethod"]', "WIRE");
  await adminPage.fill('input[name="senderName"]', "Taylor Morgan");
  await adminPage.fill('input[name="sourceName"]', "Lakeview Credit Union");
  await adminPage.fill('input[name="sourceLast4"]', "3141");
  await adminPage.fill('input[name="amount"]', "125.00");
  await adminPage.fill('input[name="activityDate"]', "2026-10-01");
  await adminPage.getByLabel(/I independently confirmed these funds and details/).check();
  await adminPage.getByRole("button", { name: "Submit payment for approval" }).click();
  await adminPage.waitForURL("**/admin?notice=credit-submitted");
  const adminCredit = await db.transaction.findFirst({ where: { description: "Taylor Morgan", accountId: marcusChecking.id }, orderBy: { createdAt: "desc" } });
  const marcusBalanceAfterCreditRequest = (await db.account.findUnique({ where: { id: marcusChecking.id } }))?.balance;
  check("Named, date-selected wire payment remains pending until separately approved", Boolean(adminCredit) && adminCredit.status === "PENDING_APPROVAL" && adminCredit.paymentMethod === "WIRE" && adminCredit.description === "Taylor Morgan" && adminCredit.counterparty?.includes("Lakeview Credit Union") && adminCredit.counterparty?.includes("3141") && adminCredit.createdAt.toISOString().slice(0, 10) === "2026-10-01" && marcusBalanceAfterCreditRequest === marcusBalanceBeforeCredit);
  if (adminCredit) await reviewGroup(adminPage, adminCredit.reference);
  const approvedCredit = adminCredit ? await db.transaction.findUnique({ where: { id: adminCredit.id } }) : null;
  const marcusBalanceAfterCreditApproval = (await db.account.findUnique({ where: { id: marcusChecking.id } }))?.balance;
  check("Approved named payment updates the target balance and activity", approvedCredit?.status === "COMPLETED" && approvedCredit.amount === 12500 && marcusBalanceAfterCreditApproval === (marcusBalanceBeforeCredit ?? 0) + 12500);
  await marcusPage.goto(`${BASE}/transactions`, { waitUntil: "load" });
  const senderActivityText = await marcusPage.locator("main").innerText();
  check("Approved incoming payment displays only the sender name in recipient activity", senderActivityText.includes("Taylor Morgan") && !senderActivityText.includes("Payment from Taylor Morgan") && !senderActivityText.includes("Lakeview Credit Union"));

  const checkingRecipients = (await db.account.findMany({
    where: { type: "CHECKING", status: "ACTIVE", user: { role: "CUSTOMER", enrollmentStatus: "APPROVED" } },
    select: { id: true, userId: true },
  })).filter((account, index, all) => all.findIndex((candidate) => candidate.userId === account.userId) === index);
  await adminPage.selectOption('select[name="recipient"]', "ALL_CUSTOMERS");
  await adminPage.selectOption('select[name="paymentMethod"]', "ACH");
  await adminPage.fill('input[name="senderName"]', "Acme Community Foundation");
  await adminPage.fill('input[name="sourceName"]', "");
  await adminPage.fill('input[name="sourceLast4"]', "");
  await adminPage.fill('input[name="amount"]', "1.25");
  await adminPage.fill('input[name="activityDate"]', "2026-10-02");
  await adminPage.getByLabel(/I independently confirmed these funds and details/).check();
  await adminPage.getByRole("button", { name: "Submit payment for approval" }).click();
  await adminPage.waitForURL("**/admin?notice=credit-submitted");
  const bulkPayments = await db.transaction.findMany({ where: { description: "Acme Community Foundation" } });
  const bulkReference = bulkPayments[0]?.reference;
  check("Admin can send the same named payment to every approved customer's checking account", bulkPayments.length === checkingRecipients.length && bulkPayments.every((row) => row.status === "PENDING_APPROVAL" && row.amount === 125 && row.reference === bulkReference) && checkingRecipients.every((account) => bulkPayments.some((row) => row.accountId === account.id)));
  if (bulkReference) await reviewGroup(adminPage, bulkReference);
  await marcusPage.reload({ waitUntil: "load" });
  check("Batch payment appears in customer activity by sender", (await marcusPage.locator("main").innerText()).includes("Acme Community Foundation"));
  await marcusPage.close();

  /* ---------------- TRANSACTIONS ---------------- */
  await page.goto(`${BASE}/transactions`, { waitUntil: "load" });
  await page.waitForSelector("text=E2E lunch split", { timeout: 20000 });
  const txText = await page.locator("main").innerText();
  check("Transactions page lists P2P send", txText.includes("E2E lunch split"));
  check("Every listed transaction provides a receipt link", await page.getByRole("link", { name: "Receipt" }).count() > 0);
  await page.getByRole("link", { name: "Receipt" }).first().click();
  await page.waitForURL((url) => /^\/transactions\//.test(url.pathname), { timeout: 20000 });
  await page.getByRole("heading", { name: /receipt/i }).waitFor({ state: "visible" });
  check("Receipt link opens the matching transaction details page", (await page.locator("main").innerText()).includes("Reference"));
  await page.goto(`${BASE}/transactions`, { waitUntil: "load" });
  await page.waitForSelector("text=E2E lunch split", { timeout: 20000 });
  await page.selectOption('select[name="category"]', "FOOD");
  await page.click('button[type="submit"]:has-text("Search")');
  await page.waitForLoadState("load");
  check("Category filter applies (URL updated)", page.url().includes("category=FOOD"));
  await shot(page, "05-transactions");

  /* ---------------- ACCOUNT DETAIL ---------------- */
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  const accountLink = page.locator('a[href^="/accounts/"]').first();
  const href = await accountLink.getAttribute("href");
  await page.goto(`${BASE}${href}`, { waitUntil: "load" });
  await page.waitForSelector("text=Available balance");
  check("Account detail page renders", true);
  await shot(page, "06-account-detail");

  /* ---------------- CARDS ---------------- */
  await page.goto(`${BASE}/cards`, { waitUntil: "load" });
  await page.waitForSelector("text=Card holder");
  check("Cards page renders virtual card", true);
  await page.click('button[title="Show number"]');
  await page.waitForTimeout(250);
  const cardText = await page.locator("main").innerText();
  check("Card number reveal works", /4532 9101 4473 \d{4}/.test(cardText));
  await shot(page, "07-cards");

  await page.click('button:has-text("Lock card")');
  await page.waitForSelector("text=Frozen", { timeout: 20000 });
  check("Card freeze toggle works", true);
  await shot(page, "08-card-frozen");
  await page.click('button:has-text("Unlock card")'); // unfreeze
  await page.waitForTimeout(600);

  /* ---------------- STATEMENTS ---------------- */
  await page.goto(`${BASE}/statements`, { waitUntil: "load" });
  await page.locator('a[href^="/statements/"]:visible').first().waitFor({ state: "visible", timeout: 20000 });
  const stText = await page.locator("main").innerText();
  check("Statements page lists months", stText.toLowerCase().includes("statement period"));
  await shot(page, "09-statements");

  const viewLink = page.locator('a[href^="/statements/"]:visible').first();
  const stHref = await viewLink.getAttribute("href");
  await page.goto(`${BASE}${stHref}`, { waitUntil: "load" });
  await page.waitForSelector("text=Monthly account statement");
  check("Statement detail renders", true);
  await shot(page, "10-statement-detail");

  /* ---------------- SETTINGS ---------------- */
  await page.goto(`${BASE}/settings`, { waitUntil: "load" });
  await page.waitForSelector('input[name="firstName"]');
  await page.fill('input[name="phone"]', "+1 (312) 555-0100");
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector("text=has been updated", { timeout: 20000 });
  check("Settings profile update works", true);
  await shot(page, "11-settings");

  // Existing (pre-username) users keep email sign-in and choose a username themselves.
  const demoBeforeUsername = await db.user.findUnique({ where: { email: "demo@vela.app" } });
  check("Existing user starts without a username and was not given one silently", demoBeforeUsername?.username === null && demoBeforeUsername?.usernameNormalized === null);
  await page.locator('input[name="username"]').fill("Demo.User");
  await page.getByRole("button", { name: "Save username" }).click();
  await page.getByText("Your Username / User ID is now Demo.User", { exact: false }).waitFor({ timeout: 20000 });
  const demoAfterUsername = await db.user.findUnique({ where: { email: "demo@vela.app" } });
  check("Existing user can choose a username; email and id are unchanged", demoAfterUsername?.username === "Demo.User" && demoAfterUsername.usernameNormalized === "demo.user" && demoAfterUsername.id === demoBeforeUsername?.id);

  // Password-change fields: hidden by default, toggle reveals without clearing or submitting.
  const currentPasscode = page.getByLabel("Current passcode");
  await currentPasscode.fill("typed-not-submitted");
  await page.getByRole("button", { name: "Show current password" }).click();
  check("Settings password toggle reveals the typed value without submitting", await currentPasscode.getAttribute("type") === "text" && await currentPasscode.inputValue() === "typed-not-submitted" && await page.getByText("Your passcode has been changed").count() === 0);
  await page.getByRole("button", { name: "Hide current password" }).click();
  check("Settings password field is hidden again after Hide password", await currentPasscode.getAttribute("type") === "password");

  await page.goto(`${BASE}/linked-accounts`, { waitUntil: "load" });
  await page.waitForSelector("text=No external accounts linked");
  const bankLinkingText = await page.locator("main").innerText();
  check("Bank-linking configuration stays hidden from customers", !/(PLAID_CLIENT_ID|PLAID_SECRET|not configured|Plaid|access token|environment variable)/i.test(bankLinkingText));

  /* ---------------- LOGOUT / SIGNUP ---------------- */
  await page.click('button[title="Sign out"]');
  await page.waitForURL("**/login", { timeout: 20000 });
  check("Logout returns to login", true);
  const cookiesAfterLogout = await page.context().cookies(BASE);
  check("Logout clears session, legacy, and MFA-challenge cookies", !cookiesAfterLogout.some((cookie) => cookie.name === "fmb_session_v2" || cookie.name === "fmb_session" || cookie.name === "fmb_mfa_pending"));

  await page.fill('input[name="username"]', "DEMO.User");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  const repeatLoginMfa = await finishAuthenticator(page, "demo@vela.app");
  check("Returning users must enter a fresh authenticator code", repeatLoginMfa.mfaPath === "/mfa/verify" && !repeatLoginMfa.hadFullSession);
  await page.click('button[title="Sign out"]');
  await page.waitForURL("**/login", { timeout: 20000 });

  await page.goto(`${BASE}/signup`, { waitUntil: "load" });
  await page.locator('input[name="ageConfirmed"]').check();
  await page.locator('input[name="usResident"]').check();
  await page.selectOption('select[name="identifierType"]', "CARD");
  await page.fill('input[name="lastSix"]', "123456");
  await page.locator('input[name="alternateVerification"]').check();
  const safeEnrollmentFields = await page.getByLabel("Email verification code").count() === 0 && await page.getByLabel("Card PIN").count() === 0 && await page.locator('input[name*="ssn" i], input[name*="tin" i]').count() === 0;
  check("Enrollment does not collect SSN/TIN, email codes, or card PINs", safeEnrollmentFields);
  await page.fill('input[name="firstName"]', "Ada");
  await page.fill('input[name="lastName"]', "Okoye");
  const adaStamp = Date.now();
  const adaEmail = `ada${adaStamp}@example.com`;
  const adaUsername = `Ada.Okoye${adaStamp}`;
  await page.fill('input[name="username"]', adaUsername);
  await page.fill('input[name="email"]', adaEmail);
  await page.fill('input[name="phone"]', "(312) 555-0147");
  await page.fill('input[name="password"]', "supersecret1");
  await page.fill('input[name="openingDeposit"]', "500");
  await page.click('button:has-text("Continue enrollment")');
  await page.waitForURL("**/enrollment/pending", { timeout: 20000 });
  const pendingPageText = await page.locator("main").innerText();
  const pendingAda = await db.user.findUnique({ where: { email: adaEmail } });
  check("Enrollment creates a pending profile and blocks sign-in", pendingAda?.enrollmentStatus === "PENDING_APPROVAL" && pendingPageText.includes("Your enrollment is being processed") && !/admin|approval|review/i.test(pendingPageText) && !(await page.context().cookies(BASE)).some((cookie) => cookie.name === "fmb_session_v2"));
  check("Pending enrollment page links back to sign in", await page.getByRole("link", { name: "Go to sign in" }).isVisible());

  await page.getByRole("link", { name: "Go to sign in" }).click();
  await page.fill('input[name="username"]', adaUsername.toLowerCase());
  await page.fill('input[name="password"]', "supersecret1");
  await page.click('button[type="submit"]');
  await page.getByText("Your enrollment is being processed. Please try signing in again later.", { exact: false }).waitFor();
  check("Login refuses a pending enrollment", !(await page.context().cookies(BASE)).some((cookie) => cookie.name === "fmb_session_v2"));

  await adminPage.goto(`${BASE}/admin`, { waitUntil: "load" });
  const pendingAdaAccount = pendingAda ? await db.account.findFirst({ where: { userId: pendingAda.id, type: "CHECKING" } }) : null;
  const pendingAdaActivityCount = pendingAda ? await db.transaction.count({ where: { account: { userId: pendingAda.id } } }) : 0;
  check("Pending enrollment starts with an empty, zero-balance account", pendingAda?.enrollmentStatus === "PENDING_APPROVAL" && pendingAdaAccount?.balance === 0 && pendingAdaActivityCount === 0);

  const enrollmentReview = adminPage.locator("article").filter({ hasText: adaEmail }).filter({ hasText: "Awaiting enrollment approval" });
  await enrollmentReview.locator('select[name="historyChoice"]').selectOption("none");
  await enrollmentReview.getByRole("button", { name: "Approve enrollment" }).click();
  await adminPage.waitForURL("**/admin?notice=enrollment-approved", { timeout: 20000 });
  const approvedAda = await db.user.findUnique({ where: { email: adaEmail } });
  check("Admin can approve enrollment and records who reviewed it", approvedAda?.enrollmentStatus === "APPROVED" && approvedAda.enrollmentReviewedById !== null && approvedAda.enrollmentReviewedAt instanceof Date);
  check("Enrollment stored the username separately from the internal id", approvedAda?.username === adaUsername && approvedAda.usernameNormalized === adaUsername.toLowerCase() && approvedAda.id !== adaUsername);

  await page.fill('input[name="username"]', adaUsername.toUpperCase());
  await page.fill('input[name="password"]', "supersecret1");
  await page.click('button[type="submit"]');
  const adaMfa = await finishAuthenticator(page, adaEmail);
  check("Approved applicant must enroll a unique authenticator before signing in", adaMfa.mfaPath === "/mfa/setup" && !adaMfa.hadFullSession);
  const newUserText = await page.locator("body").innerText();
  const newUserMain = await page.locator("main").innerText();
  const ada = await accountOwner(adaEmail);
  const adaActivityCount = ada ? await db.transaction.count({ where: { account: { userId: ada.id } } }) : 0;
  check("Approved applicant can sign in", newUserText.includes("Welcome, Ada"));
  check("Admin's opt-out leaves the new customer's accounts at zero with no generated activity", Boolean(ada) && ada.accounts.find((account) => account.type === "CHECKING")?.balance === 0 && adaActivityCount === 0 && !newUserMain.includes("Trader Joe's"));
  await shot(page, "12-new-user-dashboard");

  const priorTotpSecret = authenticatorSecrets.get(adaEmail);
  await adminPage.goto(`${BASE}/admin`, { waitUntil: "load" });
  const authenticatorPanel = adminPage.locator("section").filter({ hasText: "Authenticator management" });
  const adaAuthenticatorRow = authenticatorPanel.locator("article").filter({ hasText: adaEmail });
  await adaAuthenticatorRow.getByRole("checkbox").check();
  await adaAuthenticatorRow.getByRole("button", { name: "Reset authenticator" }).click();
  await adminPage.waitForURL("**/admin?notice=authenticator-reset", { timeout: 20000 });
  const adaAfterReset = await db.user.findUnique({ where: { email: adaEmail }, select: { mfaEnabled: true, totpSecretEncrypted: true } });
  check("Admin can reset a lost authenticator without enabling email/SMS fallback", adaAfterReset?.mfaEnabled === false && adaAfterReset.totpSecretEncrypted === null);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  await page.waitForURL("**/login", { timeout: 20000 });
  await page.fill('input[name="username"]', adaEmail);
  await page.fill('input[name="password"]', "supersecret1");
  await page.click('button[type="submit"]');
  const reEnrollMfa = await finishAuthenticator(page, adaEmail);
  check("Authenticator reset requires a fresh one-device enrollment", reEnrollMfa.mfaPath === "/mfa/setup" && authenticatorSecrets.get(adaEmail) !== priorTotpSecret);

  const invalidSessionPage = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await invalidSessionPage.context().addCookies([{ name: "fmb_session_v2", value: "not-a-valid-token", url: BASE }]);
  await invalidSessionPage.goto(`${BASE}/dashboard`, { waitUntil: "load" });
  await invalidSessionPage.waitForURL("**/login");
  check("Invalid cookie is still rejected by server-side session verification", true);
  await invalidSessionPage.close();

  await browser.close();
  await db.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch(async (e) => {
  console.error("E2E failure:", e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
