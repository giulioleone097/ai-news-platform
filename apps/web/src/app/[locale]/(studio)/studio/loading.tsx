"use client";

import { useParams } from "next/navigation";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

export default function StudioLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = isLocale(params.locale) ? params.locale : defaultLocale;

  return (
    <div className="studio-skeleton" aria-busy="true" aria-live="polite">
      <p className="sr-only">{getMessages(locale).common.loading}</p>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
