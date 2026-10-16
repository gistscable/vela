/** Shared-preview (embedded sandbox) host detection. */

export function isE2bPreviewHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return h.includes(".e2b.app") || h.endsWith(".e2b.dev") || /^[0-9]+-[a-z0-9-]+\.e2b\./.test(h);
}

export function isSharedPreviewRequestHost(host: string | null | undefined): boolean {
  return isE2bPreviewHost(host);
}
