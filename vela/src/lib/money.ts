/** Money/date formatting helpers. All money is integer cents. */

export function formatCents(cents: number, opts: { sign?: boolean } = {}): string {
  const value = (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (cents < 0) return `-$${value}`;
  return opts.sign && cents > 0 ? `+$${value}` : `$${value}`;
}

/** Parse a user-entered dollar amount ("1,234.56", "$42", "10.5") to cents. */
export function parseCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Math.round(Number(text) * 100);
  return Number.isFinite(value) ? value : null;
}

export function formatDate(date: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function maskAccountNumber(accountNumber: string): string {
  const digits = String(accountNumber ?? "");
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

export function formatAccountNumberLong(accountNumber: string): string {
  const digits = String(accountNumber ?? "").replace(/\s/g, "");
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}
