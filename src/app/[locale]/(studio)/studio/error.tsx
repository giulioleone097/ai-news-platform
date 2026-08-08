"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

export default function StudioError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const messages = getMessages(locale);

  return (
    <section className="studio-section" aria-labelledby="studio-error-title">
      <div className="studio-section__header">
        <div>
          <p className="studio-kicker">500</p>
          <h1 id="studio-error-title">{messages.errors.genericTitle}</h1>
          <p>{messages.errors.genericDescription}</p>
        </div>
      </div>
      <div className="studio-empty" role="alert">
        <button className="studio-button" type="button" onClick={reset}>
          {messages.common.retry}
        </button>
        <Link className="studio-button studio-button--secondary" href={`/${locale}/studio`}>
          {messages.navigation.studio}
        </Link>
      </div>
    </section>
  );
}
