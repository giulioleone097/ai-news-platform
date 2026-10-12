"use client";

import { useParams } from "next/navigation";
import "@/styles/site/lists.css";
import { boundaryMessages } from "@/i18n/messages/boundary";
import { normalizeLocale } from "@atlasnews/core/locale";

// A loading fallback gets no params, so the locale comes from the URL, as in the site error and not-found pages.
export default function SearchLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = normalizeLocale(params.locale);

  return (
    <main className="site-shell archive-main" id="main-content" aria-busy="true" aria-live="polite">
      <span className="sr-only">{boundaryMessages[locale].loading}</span>
      <div className="list-skeleton" aria-hidden="true">
        <span className="list-skeleton__title" />
        <span className="list-skeleton__field" />
        {Array.from({ length: 6 }, (_, index) => (
          <span className="list-skeleton__row" key={index} />
        ))}
      </div>
    </main>
  );
}
