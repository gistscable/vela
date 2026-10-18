/**
 * Single source of truth for the customer-facing brand name.
 *
 * The logo lockup lives in public/fmb-logo.svg and is rendered through
 * src/components/Logo.tsx. Prefer interpolating BRAND.name in customer-facing
 * copy rather than hardcoding the string.
 */
export const BRAND = {
  name: "FMB",
} as const;
