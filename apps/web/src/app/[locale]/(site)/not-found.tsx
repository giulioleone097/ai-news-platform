"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { defaultLocale, getMessages, isLocale, localizedPath } from "@/i18n";

export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const messages = getMessages(locale);

  return (
    <main id="main-content" className="site-shell not-found">
      <p>404</p>
      <h1>{messages.errors.notFoundTitle}</h1>
      <span>{messages.errors.notFoundDescription}</span>
      <Link className="button button--primary" href={localizedPath("/", locale)}>
        {messages.errors.backHome}
      </Link>
    </main>
  );
}
