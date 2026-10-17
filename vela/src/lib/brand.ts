/**
 * Single source of truth for the customer-facing brand name.
 *
 * The wordmark itself is baked into public/fmb-logo.png (served via
 * src/components/Logo.tsx), so the brand only appears as browser-readable
 * text where UI copy genuinely needs it — and when it does, prefer
 * interpolating BRAND.name over hardcoding the string.
 */
export const BRAND = {
  name: "FMB",
} as const;
