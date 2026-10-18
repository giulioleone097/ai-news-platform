"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { Messages } from "@/i18n";
import { buildSocialLinks } from "@/lib/social-links";

const noSubscription = () => () => {};
const hasWebShare = () => typeof navigator.share === "function";
const noWebShare = () => false;

/**
 * Share and copy-link controls: quiet icon buttons that sit on the article byline row.
 * The icons arrive as server-rendered nodes so the icon library stays out of the client bundle.
 */
export function ShareActions({
  url,
  title,
  labels,
  icons,
}: {
  url: string;
  title: string;
  labels: Messages["share"];
  icons: { share: ReactNode; copy: ReactNode; copied: ReactNode };
}) {
  const [copied, setCopied] = useState(false);
  const links = buildSocialLinks({ url, title });
  // The system share sheet only where the browser has one; elsewhere "Copy link" is the same action.
  const canShare = useSyncExternalStore(noSubscription, hasWebShare, noWebShare);

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch {
      // The reader closed the sheet.
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="article-actions__group" role="group" aria-label={labels.groupLabel}>
      {canShare ? (
        <button className="article-action" type="button" onClick={() => void share()} aria-label={labels.action} title={labels.action}>
          {icons.share}
        </button>
      ) : null}
      <a className="article-action" href={links.linkedin} target="_blank" rel="noreferrer" aria-label={labels.linkedInLabel} title={labels.linkedInLabel}>
        <span className="article-action__brand" aria-hidden="true">in</span>
      </a>
      <a className="article-action" href={links.x} target="_blank" rel="noreferrer" aria-label={labels.xLabel} title={labels.xLabel}>
        <span className="article-action__brand" aria-hidden="true">X</span>
      </a>
      <a className="article-action" href={links.whatsapp} target="_blank" rel="noreferrer" aria-label={labels.whatsappLabel} title={labels.whatsappLabel}>
        <span className="article-action__brand" aria-hidden="true">WA</span>
      </a>
      <button
        className="article-action"
        type="button"
        onClick={copy}
        aria-label={copied ? labels.copiedLabel : labels.copyLinkLabel}
        title={labels.copyLinkLabel}
      >
        {copied ? icons.copied : icons.copy}
      </button>
    </div>
  );
}
