import { describe, expect, it } from "vitest";
import { normalizeUsername, validateUsername } from "@/lib/username";

describe("validateUsername", () => {
  it("accepts typical usernames and keeps the typed spelling", () => {
    for (const name of ["sam", "Sam.Lee", "a_b-c.9", "user123", "A1b", "x".repeat(32)]) {
      const result = validateUsername(name);
      expect(result.ok, name).toBe(true);
      if (result.ok) {
        expect(result.username).toBe(name);
        expect(result.normalized).toBe(name.toLowerCase());
      }
    }
  });

  it("trims surrounding whitespace", () => {
    const result = validateUsername("  Sam.Lee  ");
    expect(result).toEqual({ ok: true, username: "Sam.Lee", normalized: "sam.lee" });
  });

  it("rejects empty, too short and too long values", () => {
    for (const bad of ["", "   ", "ab", "x".repeat(33), undefined, null, 42]) {
      expect(validateUsername(bad).ok, String(bad)).toBe(false);
    }
  });

  it("rejects @ so a username can never be confused with an email address", () => {
    const result = validateUsername("sam@example.com");
    expect(result.ok).toBe(false);
  });

  it("rejects spaces, symbols, non-ASCII and edge punctuation", () => {
    for (const bad of ["sam lee", "sam!", "sam/lee", "émile", "_sam", "sam.", "-sam", "sam-", "<script>"]) {
      expect(validateUsername(bad).ok, bad).toBe(false);
    }
  });

  it("rejects reserved staff/system names in any case", () => {
    for (const bad of ["admin", "Administrator", "ROOT", "Support"]) {
      expect(validateUsername(bad).ok, bad).toBe(false);
    }
  });

  it("normalizes case-insensitively", () => {
    expect(normalizeUsername("  SAM.Lee ")).toBe("sam.lee");
    expect(validateUsername("SAM.LEE")).toMatchObject({ ok: true, normalized: "sam.lee" });
  });
});
