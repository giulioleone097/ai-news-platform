"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { findModelContext } from "@/components/site/site-tools/detect";

/**
 * Offers the Studio's page tools (open the article editor, read the form, fill a draft) to an AI agent in the
 * editor's browser (WebMCP, `docs/SITE_TOOLS.md`). It renders nothing and loads nothing unless the browser has
 * `document.modelContext`; leaving the Studio unregisters the tools.
 */
export function StudioSiteTools() {
  const router = useRouter();

  useEffect(() => {
    const context = findModelContext(document);
    if (!context) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./start")
      .then(({ startStudioSiteTools }) => {
        if (cancelled) return;
        dispose = startStudioSiteTools(context, (path) => router.push(path));
        // The shell's "Agent tools ready" status reads this; it stays hidden until the tools are registered.
        document.documentElement.dataset.studioAgents = "ready";
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
      delete document.documentElement.dataset.studioAgents;
    };
  }, [router]);

  return null;
}
