"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/studio/page-head";
import { boundaryMessages } from "@/i18n/messages/boundary";
import { normalizeLocale } from "@atlasnews/core/locale";

/** A missing article, entity or category: said inside the Studio, with the way back. */
export default function StudioNotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params.locale);
  const messages = boundaryMessages[locale];

  return (
    <PageHead description={messages.notFoundDescription} title={messages.notFoundTitle}>
      <Link className="button button--primary" href={`/${locale}/studio`}>
        {messages.dashboard}
      </Link>
    </PageHead>
  );
}
