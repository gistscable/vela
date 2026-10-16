import { isE2bPreviewHost } from "@/lib/preview";

/** CORS/origin helpers for the preview-only API routes. */

export function previewCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function isPreviewApiOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (isE2bPreviewHost(url.host)) return true;
    const requestHost = request.headers.get("host");
    return url.host === requestHost;
  } catch {
    return false;
  }
}
