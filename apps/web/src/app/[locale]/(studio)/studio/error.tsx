"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/studio/page-head";
import { boundaryMessages } from "@/i18n/messages/boundary";
import { normalizeLocale } from "@atlasnews/core/locale";

export default function StudioError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params.locale);
  const messages = boundaryMessages[locale];

  return (
    <div role="alert">
      <PageHead description={messages.genericDescription} title={messages.genericTitle}>
        <button className="button button--primary" type="button" onClick={reset}>
          {messages.retry}
        </button>
        <Link className="button button--quiet" href={`/${locale}/studio`}>
          {messages.dashboard}
        </Link>
      </PageHead>
    </div>
  );
}
