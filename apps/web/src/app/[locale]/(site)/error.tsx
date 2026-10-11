"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import "@/styles/site/notice.css";
import { defaultLocale, getMessages, isLocale, localizedPath } from "@/i18n";

export default function SiteError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const messages = getMessages(locale);

  return (
    <main id="main-content" className="notice">
      <h1>{messages.errors.genericTitle}</h1>
      <p>{messages.errors.genericDescription}</p>
      <div className="notice__actions">
        <button className="button button--primary" type="button" onClick={reset}>
          {messages.common.retry}
        </button>
        <Link className="button" href={localizedPath("/", locale)}>
          {messages.errors.backHome}
        </Link>
      </div>
    </main>
  );
}
