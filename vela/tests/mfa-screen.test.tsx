import bcrypt from "bcryptjs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth");
let Page: typeof import("@/app/(auth)/mfa/verify/page").default;

const ALICE = { email: "alice.wonder@example.com", phone: "+1 (312) 555-0192" };
const BOB = { email: "robert.builder@acme.test", phone: "773-555-4455" };

async function addUser(email: string, phone: string | null) {
  return db.user.create({
    data: { email, phone, passwordHash: await bcrypt.hash("pw-12345678", 4), firstName: "T", lastName: "U", mfaEnabled: true },
  });
}

/** Render the page as the server would and also capture the props handed to the client component. */
async function renderScreen() {
  const element = (await Page()) as { props: unknown };
  return { html: renderToStaticMarkup(element as never), props: JSON.stringify(element.props) };
}

/** Everything that would reveal a full contact value. */
function fullContactFragments(c: { email: string; phone: string }) {
  const [local] = c.email.split("@");
  const digits = c.phone.replace(/\D/g, "");
  return [c.email, local, c.phone, digits, digits.slice(-7), digits.slice(0, 6), "555-0192", "555-4455", "(312)", "773-"];
}

beforeEach(async () => {
  cookieJar.clear();
  testDb = useDisposableDatabase();
  ({ db } = await import("@/lib/db"));
  auth = await import("@/lib/auth");
  Page = (await import("@/app/(auth)/mfa/verify/page")).default;
});
afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("MFA method-choice screen", () => {
  it("shows the challenge user's own masked phone and email", async () => {
    const alice = await addUser(ALICE.email, ALICE.phone);
    await auth.setMfaChallengeCookie(alice.id, "verify");
    const { html } = await renderScreen();
    expect(html).toContain("Phone ending in <strong>0192</strong>");
    expect(html).toContain("<strong>a•••@example.com</strong>");
    expect(html).toContain("Text message to phone");
    expect(html).toContain("Email code");
  });

  it("never uses 'last four digits' wording for email", async () => {
    const alice = await addUser(ALICE.email, ALICE.phone);
    await auth.setMfaChallengeCookie(alice.id, "verify");
    const { html } = await renderScreen();
    expect(html).not.toMatch(/last four digits/i);
    expect(html).not.toMatch(/ending in <strong>[^<]*•/);
  });

  it("shows each user their own details, never another user's", async () => {
    const alice = await addUser(ALICE.email, ALICE.phone);
    const bob = await addUser(BOB.email, BOB.phone);

    await auth.setMfaChallengeCookie(alice.id, "verify");
    const forAlice = await renderScreen();
    expect(forAlice.html).toContain("<strong>0192</strong>");
    expect(forAlice.html).toContain("a•••@example.com");
    expect(forAlice.html).not.toContain("4455");
    expect(forAlice.html).not.toContain("r•••@acme.test");

    await auth.setMfaChallengeCookie(bob.id, "verify");
    const forBob = await renderScreen();
    expect(forBob.html).toContain("<strong>4455</strong>");
    expect(forBob.html).toContain("r•••@acme.test");
    expect(forBob.html).not.toContain("0192");
    expect(forBob.html).not.toContain("a•••@example.com");
  });

  it("does not expose full contact values anywhere in the rendered page or its props", async () => {
    for (const contact of [ALICE, BOB]) {
      cookieJar.clear();
      const user = await addUser(contact.email, contact.phone);
      await auth.setMfaChallengeCookie(user.id, "verify");
      const { html, props } = await renderScreen();
      for (const fragment of fullContactFragments(contact)) {
        expect(html, `html leaks ${fragment}`).not.toContain(fragment);
        expect(props, `props leak ${fragment}`).not.toContain(fragment);
      }
      expect(props).not.toContain("passwordHash");
      expect(props).not.toContain(user.id);
    }
  });

  it("takes the user from the MFA challenge only: no props, no URL parameter, no client-supplied id", async () => {
    const alice = await addUser(ALICE.email, ALICE.phone);
    const bob = await addUser(BOB.email, BOB.phone);
    await auth.setMfaChallengeCookie(alice.id, "verify");
    // The page declares no parameters, so a crafted ?userId=/?email= has nothing to bind to.
    expect(Page.length).toBe(0);
    const spoofed = await (Page as unknown as (p: unknown) => Promise<{ props: unknown }>)({
      searchParams: Promise.resolve({ userId: bob.id, email: BOB.email }),
      params: Promise.resolve({ userId: bob.id }),
    });
    const html = renderToStaticMarkup(spoofed as never);
    expect(html).toContain("<strong>0192</strong>");
    expect(html).not.toContain("4455");
  });

  it("rejects a forged challenge cookie instead of trusting its user id", async () => {
    const bob = await addUser(BOB.email, BOB.phone);
    // Unsigned token naming Bob as the subject.
    const forged = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: bob.id, kind: "mfa", stage: "verify" })).toString("base64url")}.`;
    cookieJar.set("fmb_mfa_challenge", forged);
    expect((await run(() => renderScreen())).redirectedTo).toBe("/login");
  });

  it("requires a verify-stage challenge", async () => {
    const alice = await addUser(ALICE.email, ALICE.phone);
    expect((await run(() => renderScreen())).redirectedTo).toBe("/login");
    await auth.setMfaChallengeCookie(alice.id, "setup");
    expect((await run(() => renderScreen())).redirectedTo).toBe("/login");
  });

  it("says so honestly when no phone is registered", async () => {
    const user = await addUser(ALICE.email, null);
    await auth.setMfaChallengeCookie(user.id, "verify");
    const { html } = await renderScreen();
    expect(html).toContain("No phone number registered");
    expect(html).not.toContain("Phone ending in");
    expect(html).toContain("a•••@example.com");
  });

  it("says so honestly when the phone is too short to mask safely", async () => {
    for (const phone of ["555-0100", "1234", "  ", "n/a"]) {
      cookieJar.clear();
      const user = await addUser(`short.${phone.length}.${Math.random().toString(36).slice(2, 6)}@example.com`, phone);
      await auth.setMfaChallengeCookie(user.id, "verify");
      const { html } = await renderScreen();
      expect(html, phone).toContain("No phone number registered");
      expect(html, phone).not.toContain("Phone ending in");
      expect(html, phone).not.toContain("0100");
    }
  });

  it("offers four selectable methods without claiming a code was sent", async () => {
    const alice = await addUser(ALICE.email, ALICE.phone);
    await auth.setMfaChallengeCookie(alice.id, "verify");
    const { html } = await renderScreen();
    expect(html).toContain("Enter the six-digit code from Authenticator.");
    expect(html).not.toContain("If you lose access to your authenticator, contact an administrator for a reset");
    expect(html).not.toContain("Google Authenticator");
    expect(html).not.toMatch(/no text will be sent/i);
    expect(html).not.toMatch(/no email will be sent/i);
    expect(html).not.toMatch(/no approval request will be sent/i);
    expect(html).not.toContain("not verified");
    expect(html).not.toMatch(/code (was|has been|is being) sent/i);
    expect(html).not.toMatch(/(?<!not )(?<!un)verified (phone|email|contact)/i);
    expect(html).not.toMatch(/>\s*Verified\s*</);
    // Nothing can be submitted until a method is chosen; the code form appears after selection
    // (see mfa-method-selection.test.tsx).
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="totpCode"');
    // Every method is a real, enabled button; none is a disabled "Not enabled" card.
    for (const id of ["authenticator", "sms", "email", "app-approval"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*data-testid="mfa-method-${id}"`));
    }
    expect(html).not.toMatch(/aria-disabled/);
    expect(html).not.toContain("Not enabled");
  });

  it("does not record anything about contact verification in the database", async () => {
    const columns = testDb.raw.prepare(`PRAGMA table_info("User")`).all().map((c) => String(c.name).toLowerCase());
    expect(columns.filter((c) => /(phone|email).*verif|verif.*(phone|email)/.test(c))).toEqual([]);
  });
});
