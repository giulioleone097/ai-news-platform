"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import "@/styles/site/notice.css";
import { defaultLocale, getMessages, isLocale, localizedPath } from "@/i18n";

export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const messages = getMessages(locale);

  return (
    <main id="main-content" className="notice">
      <h1>{messages.errors.notFoundTitle}</h1>
      <p>{messages.errors.notFoundDescription}</p>
      <div className="notice__actions">
        <Link className="button button--primary" href={localizedPath("/latest", locale)}>
          {messages.errors.latestStories}
        </Link>
      </div>
    </main>
  );
}
