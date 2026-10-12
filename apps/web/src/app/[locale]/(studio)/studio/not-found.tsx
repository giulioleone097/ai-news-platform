"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/studio/page-head";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

/** A missing article, entity or category: said inside the Studio, with the way back. */
export default function StudioNotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;
  const messages = getMessages(locale);

  return (
    <PageHead description={messages.errors.notFoundDescription} title={messages.errors.notFoundTitle}>
      <Link className="button button--primary" href={`/${locale}/studio`}>
        {messages.studio.dashboard}
      </Link>
    </PageHead>
  );
}
