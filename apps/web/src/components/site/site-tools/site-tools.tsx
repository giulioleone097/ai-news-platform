"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { findModelContext } from "./detect";

/**
 * Offers the site's page tools to an AI agent in the browser (WebMCP, `docs/SITE_TOOLS.md`).
 * It renders nothing and loads nothing unless the browser has `document.modelContext`.
 */
export function SiteTools() {
  const router = useRouter();

  useEffect(() => {
    const context = findModelContext(document);
    if (!context) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./start")
      .then(({ startSiteTools }) => {
        if (!cancelled) dispose = startSiteTools(context, (path) => router.push(path));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [router]);

  return null;
}
