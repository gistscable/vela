import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = "/home/user/vela/screenshots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.setDefaultTimeout(20000);

async function shot(name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

// Landing
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForSelector("text=checking account");
await shot("01-landing");

// Login page
await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.waitForSelector("text=Sign in to Online Banking");
await shot("02-login");

// Login
await page.fill('input[name="email"]', "demo@vela.app");
await page.fill('input[name="password"]', "demo1234");
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard");
await page.waitForSelector("text=Account Summary");
await shot("03-dashboard");

// Transfers
await page.goto(`${BASE}/transfer`, { waitUntil: "load" });
await page.waitForSelector("text=Make a transfer");
await shot("04-transfers");

// Internal-transfer review step (do not confirm the payment)
await page.goto(`${BASE}/transfer?tab=transfer`, { waitUntil: "load" });
await page.fill('input[name="amount"]', "50.00");
await page.click('button:has-text("Review transfer")');
await page.waitForSelector("text=Review this transfer");
await shot("04b-transfer-review");

// Bill pay and linked account setup
await page.goto(`${BASE}/bill-pay`, { waitUntil: "load" });
await page.waitForSelector("text=Pay a bill");
await shot("04c-bill-pay");

// Account activity
await page.goto(`${BASE}/transactions`, { waitUntil: "load" });
await page.waitForSelector("text=Account Activity");
await shot("05-activity");

// Account detail
const link = await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
const href = await page.locator('a[href^="/accounts/"]').first().getAttribute("href");
await page.goto(`${BASE}${href}`, { waitUntil: "load" });
await page.waitForSelector("text=Available balance");
await shot("06-account-detail");

// Cards
await page.goto(`${BASE}/cards`, { waitUntil: "load" });
await page.waitForSelector("text=Card holder");
await shot("07-cards");

// Statements
await page.goto(`${BASE}/statements`, { waitUntil: "load" });
await page.waitForSelector('a[href^="/statements/"]');
await shot("08-statements");

const stHref = await page.locator('a[href^="/statements/"]').first().getAttribute("href");
await page.goto(`${BASE}${stHref}`, { waitUntil: "load" });
await page.waitForSelector("text=Monthly account statement");
await shot("09-statement-detail");

// Settings
await page.goto(`${BASE}/settings`, { waitUntil: "load" });
await page.waitForSelector('input[name="firstName"]');
await shot("10-settings");

await page.goto(`${BASE}/linked-accounts`, { waitUntil: "load" });
await page.waitForSelector("text=Connected financial institutions");
await shot("10b-linked-accounts");

// Mobile dashboard
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "load" });
await page.waitForSelector("text=Accounts");
await shot("11-mobile-dashboard");

await browser.close();
console.log("screenshots refreshed");
