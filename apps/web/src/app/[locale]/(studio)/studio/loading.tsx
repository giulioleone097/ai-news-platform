"use client";

import { useParams } from "next/navigation";
import { boundaryMessages } from "@/i18n/messages/boundary";
import { normalizeLocale } from "@atlasnews/core/locale";

export default function StudioLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params.locale);

  return (
    <div className="studio-skeleton" aria-busy="true" aria-live="polite">
      <p className="sr-only">{boundaryMessages[locale].loading}</p>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
