"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import "@/styles/site/notice.css";
import { boundaryMessages } from "@/i18n/messages/boundary";
import { localizedPath, normalizeLocale } from "@atlasnews/core/locale";

export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params.locale);
  const messages = boundaryMessages[locale];

  return (
    <main id="main-content" className="notice">
      <h1>{messages.notFoundTitle}</h1>
      <p>{messages.notFoundDescription}</p>
      <div className="notice__actions">
        <Link className="button button--primary" href={localizedPath("/latest", locale)}>
          {messages.latestStories}
        </Link>
      </div>
    </main>
  );
}
