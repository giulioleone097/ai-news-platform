import type { Metadata } from "next";
import Link from "next/link";
import "./design.tokens.css";
import "./globals.css";
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
    <main id="main-content" lang="en" className="site-shell not-found">
      <p>404</p>
      <h1>{en.errors.notFoundTitle}</h1>
      <span>{en.errors.notFoundDescription}</span>
      <Link className="button button--primary" href={localizedPath("/", "en")}>
        {en.errors.backHome}
      </Link>
      <span lang="it">
        {it.errors.notFoundTitle} {it.errors.notFoundDescription}{" "}
        <Link href={localizedPath("/", "it")}>{it.errors.backHome}</Link>
      </span>
    </main>
  );
}
