import type { Metadata } from "next";
import Link from "next/link";
import "./design.tokens.css";
import "./globals.css";
import "@/styles/site/shell.css";
import "@/styles/site/notice.css";
import { BrandMark } from "@/components/site/brand-mark";
import { getMessages, localizedPath } from "@/i18n";

const en = getMessages("en");
const it = getMessages("it");

export const metadata: Metadata = {
  title: `${en.errors.notFoundTitle} / ${it.errors.notFoundTitle}`,
  robots: { index: false },
};

// Used for notFound() above the locale pages and, through global-not-found.tsx, for unmatched URLs.
// Neither has a locale, so this page shows both languages and relies on its caller for the document.
export default function NotFound() {
  return (
    <main id="main-content" lang="en" className="notice notice--standalone">
      <Link className="brand" href={localizedPath("/", "en")} aria-label={en.navigation.homeLabel}>
        <BrandMark name={en.common.brandName} />
      </Link>
      <h1>{en.errors.notFoundTitle}</h1>
      <p>{en.errors.notFoundDescription}</p>
      <div className="notice__actions">
        <Link className="button button--primary" href={localizedPath("/latest", "en")}>
          {en.errors.latestStories}
        </Link>
      </div>
      <div className="notice__other" lang="it">
        <h2>{it.errors.notFoundTitle}</h2>
        <p>
          {it.errors.notFoundDescription} <Link href={localizedPath("/latest", "it")}>{it.errors.latestStories}</Link>
        </p>
      </div>
    </main>
  );
}
