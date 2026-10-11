"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/studio/page-head";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

export default function StudioError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const messages = getMessages(locale);

  return (
    <div role="alert">
      <PageHead description={messages.errors.genericDescription} title={messages.errors.genericTitle}>
        <button className="button button--primary" type="button" onClick={reset}>
          {messages.common.retry}
        </button>
        <Link className="button button--quiet" href={`/${locale}/studio`}>
          {messages.studio.dashboard}
        </Link>
      </PageHead>
    </div>
  );
}
