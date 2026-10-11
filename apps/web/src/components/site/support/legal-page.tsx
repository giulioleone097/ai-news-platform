import Link from "next/link";
import { localizedPath, type Locale } from "@/i18n";
import { PageSections } from "./page-sections";
import { privacyCopy, supportCopy, termsCopy, type LegalCopy } from "./support-copy";
import styles from "./support.module.css";

/** Privacy and terms share one layout: title, date, the sections, and links to the support page and the other policy. */
export function LegalPage({ copy, locale, other }: { copy: LegalCopy; locale: Locale; other: "privacy" | "terms" }) {
  const support = supportCopy[locale];
  const otherTitle = (other === "privacy" ? privacyCopy : termsCopy)[locale].title;

  return (
    <main id="main-content" className={`site-shell ${styles.page}`}>
      <div className={styles.column}>
        <header className="page-head">
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <p className={styles.updated}>
            {copy.updatedLabel}{" "}
            <time dateTime={copy.updated}>
              {new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(copy.updated))}
            </time>
          </p>
        </header>
        <PageSections sections={copy.sections} />
        <nav aria-label={support.relatedLabel} className={styles.related}>
          <Link href={localizedPath("/support", locale)} prefetch={false}>{support.title}</Link>
          <Link href={localizedPath(`/${other}`, locale)} prefetch={false}>{otherTitle}</Link>
        </nav>
      </div>
    </main>
  );
}
