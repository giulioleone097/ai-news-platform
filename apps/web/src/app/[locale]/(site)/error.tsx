"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import "@/styles/site/notice.css";
import { boundaryMessages } from "@/i18n/messages/boundary";
import { localizedPath, normalizeLocale } from "@atlasnews/core/locale";

export default function SiteError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params.locale);
  const messages = boundaryMessages[locale];

  return (
    <main id="main-content" className="notice">
      <h1>{messages.genericTitle}</h1>
      <p>{messages.genericDescription}</p>
      <div className="notice__actions">
        <button className="button button--primary" type="button" onClick={reset}>
          {messages.retry}
        </button>
        <Link className="button" href={localizedPath("/", locale)}>
          {messages.backHome}
        </Link>
      </div>
    </main>
  );
}
