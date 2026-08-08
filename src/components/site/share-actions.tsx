"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import type { Messages } from "@/i18n";
import { buildSocialLinks } from "@/lib/social-links";

export function ShareActions({
  url,
  title,
  labels,
  compact = false,
}: {
  url: string;
  title: string;
  labels: Messages["share"];
  compact?: boolean;
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

  if (compact) {
    return (
      <button className="icon-action" type="button" onClick={share} aria-label={labels.groupLabel}>
        <Share2 aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="share-actions" aria-label={labels.groupLabel}>
      <button className="text-action" type="button" onClick={share}>
        <Share2 aria-hidden="true" />
        <span>{labels.action}</span>
      </button>
      <a href={links.linkedin} target="_blank" rel="noreferrer" aria-label={labels.linkedInLabel}>
        <span className="share-actions__brand" aria-hidden="true">in</span>
      </a>
      <a className="share-actions__x" href={links.x} target="_blank" rel="noreferrer" aria-label={labels.xLabel}>
        X
      </a>
      <a className="share-actions__wa" href={links.whatsapp} target="_blank" rel="noreferrer" aria-label={labels.whatsappLabel}>
        WA
      </a>
      <button type="button" onClick={copy} aria-label={copied ? labels.copiedLabel : labels.copyLinkLabel}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </div>
  );
}
