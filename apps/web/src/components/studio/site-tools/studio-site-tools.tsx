"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Locale } from "@atlasnews/core/locale";
import { findModelContext } from "@/components/site/site-tools/detect";

/**
 * Offers the Studio's content tools to an AI agent in the editor's browser (WebMCP,
 * `docs/SITE_TOOLS.md`). It renders nothing and loads nothing unless the browser has
 * `document.modelContext`; leaving the Studio unregisters the tools.
 */
export function StudioSiteTools({ locale, isAdmin }: { locale: Locale; isAdmin: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const context = findModelContext(document);
    if (!context) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./start")
      .then(({ startStudioSiteTools }) => {
        if (!cancelled) dispose = startStudioSiteTools(context, { locale, isAdmin, refresh: () => router.refresh() });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [router, locale, isAdmin]);

  return null;
}
