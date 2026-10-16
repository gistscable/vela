/** Display-safe helpers for external accounts / counterparty text. */

export function lastFourDigits(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.slice(-4);
}

export function containsLongAccountLikeNumber(value: string | null | undefined): boolean {
  return /\d{7,}/.test(String(value ?? "").replace(/[\s-]/g, ""));
}

function clean(value: string | null | undefined, fallback: string, max = 60): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || containsLongAccountLikeNumber(text)) return fallback;
  return text.slice(0, max);
}

export function safeInstitutionName(value: string | null | undefined): string {
  return clean(value, "External bank");
}

export function safeExternalNickname(value: string | null | undefined, accountType?: string | null): string {
  return clean(value, accountType === "SAVINGS" ? "External savings" : "External checking");
}

export function safeCounterparty(value: string | null | undefined): string | null {
  if (!value) return null;
  return clean(value, "First Meridian", 90);
}

export function safeTransactionDescription(value: string | null | undefined): string {
  return clean(value, "Account activity", 90);
}

const METHOD_LABELS: Record<string, string> = {
  ACH: "ACH",
  WIRE: "Wire",
  BILL_PAY: "Bill Pay",
  INTERNAL: "Internal",
  QUICK_PAY: "Quick Pay",
  MOBILE_DEPOSIT: "Mobile Deposit",
};

export function paymentMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  return METHOD_LABELS[method] ?? null;
}
