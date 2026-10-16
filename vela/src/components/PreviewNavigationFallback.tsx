"use client";

import { useEffect } from "react";

/**
 * In the token-gated Arena iframe the document can have an opaque origin. That
 * can block Next's client-side RSC fetches, so use ordinary same-frame page
 * navigations for internal links in the shared, cookie-less preview only.
 */
export function PreviewNavigationFallback({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const navigateNormally = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

      const destination = new URL(href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (destination.href !== window.location.href) window.location.assign(destination.href);
    };

    document.addEventListener("click", navigateNormally, true);
    return () => document.removeEventListener("click", navigateNormally, true);
  }, [enabled]);

  return null;
}
