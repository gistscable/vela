import { describe, expect, it } from "vitest";
import { buildMfaContactHints, maskEmail, phoneLastFour } from "@/lib/mfa-contact";

describe("phoneLastFour", () => {
  it("returns only the last four digits regardless of formatting", () => {
    expect(phoneLastFour("+1 (312) 555-0192")).toBe("0192");
    expect(phoneLastFour("312.555.0100")).toBe("0100");
    expect(phoneLastFour("+44 20 7946 0958")).toBe("0958");
  });

  it("returns null when missing, blank or without digits", () => {
    for (const value of [null, undefined, "", "   ", "n/a", "ext."]) expect(phoneLastFour(value)).toBeNull();
  });

  it("returns null when too short to mask safely", () => {
    for (const value of ["1234", "555-0100", "12 34 56 7"]) expect(phoneLastFour(value), value).toBeNull();
  });
});

describe("maskEmail", () => {
  it("shows the first character, fixed bullets and the domain", () => {
    expect(maskEmail("jordan@example.com")).toBe("j•••@example.com");
    expect(maskEmail("demo@vela.app")).toBe("d•••@vela.app");
  });

  it("does not leak the local part's length", () => {
    expect(maskEmail("jo@example.com")).toBe("j•••@example.com");
    expect(maskEmail("jordan.longname@example.com")).toBe("j•••@example.com");
  });

  it("hides a one-character local part entirely", () => {
    expect(maskEmail("j@example.com")).toBe("•••@example.com");
  });

  it("never contains the rest of the local part", () => {
    const masked = maskEmail("secret.person+tag@example.com")!;
    expect(masked).not.toContain("secret");
    expect(masked).not.toContain("person");
    expect(masked).not.toContain("tag");
  });

  it("returns null for missing or malformed addresses", () => {
    for (const value of [null, undefined, "", "   ", "no-at-sign", "@example.com", "name@", "name@nodot", "a b@example.com"]) {
      expect(maskEmail(value as string | null | undefined), String(value)).toBeNull();
    }
  });
});

describe("buildMfaContactHints", () => {
  it("returns only masked values", () => {
    const hints = buildMfaContactHints({ email: "jordan@example.com", phone: "+1 (312) 555-0192" });
    expect(hints).toEqual({ phoneLastFour: "0192", emailMasked: "j•••@example.com" });
    const serialized = JSON.stringify(hints);
    expect(serialized).not.toContain("jordan");
    expect(serialized).not.toContain("312");
    expect(serialized).not.toContain("555");
  });

  it("reports a missing or unsafe phone as null instead of inventing a destination", () => {
    expect(buildMfaContactHints({ email: "a@example.com", phone: null }).phoneLastFour).toBeNull();
    expect(buildMfaContactHints({ email: "a@example.com", phone: "555-01" }).phoneLastFour).toBeNull();
  });
});
