import { describe, expect, it } from "vitest";
import { safeCounterparty, safeTransactionDescription } from "@/lib/external-account-display";

describe("legacy bank-name display normalization", () => {
  it("rebrands stored counterparties and debit-card labels", () => {
    expect(safeCounterparty("First Meridian")).toBe("FMB");
    expect(safeCounterparty("First Meridian debit card")).toBe("FMB debit card");
    expect(safeCounterparty("First Meridian Bank ACH")).toBe("FMB ACH");
  });

  it("rebrands legacy text in transaction descriptions", () => {
    expect(safeTransactionDescription("Payment from FIRST MERIDIAN BANK")).toBe("Payment from FMB");
  });
});
