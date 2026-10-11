"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import type { Messages } from "@/i18n";
import { buildSocialLinks } from "@/lib/social-links";

/** Share and copy-link controls: quiet icon buttons that sit on the article byline row. */
export function ShareActions({
  url,
  title,
  labels,
}: {
  url: string;
  title: string;
  labels: Messages["share"];
}) {
  const [copied, setCopied] = useState(false);
  const links = buildSocialLinks({ url, title });

  async function share() {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await copy();
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="article-actions__group" role="group" aria-label={labels.groupLabel}>
      <button className="article-action" type="button" onClick={share} aria-label={labels.action} title={labels.action}>
        <Share2 aria-hidden="true" />
      </button>
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
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </div>
  );
}
