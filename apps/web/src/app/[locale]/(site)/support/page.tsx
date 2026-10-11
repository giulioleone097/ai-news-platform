import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/site/support/contact-form";
import { PageSections } from "@/components/site/support/page-sections";
import { supportCopy } from "@/components/site/support/support-copy";
import styles from "@/components/site/support/support.module.css";
import { getAlternates, isLocale, localizedPath } from "@/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = supportCopy[locale];
  return {
    title: copy.title,
    description: copy.description,
    alternates: getAlternates("/support", locale),
  };
}

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = supportCopy[locale];

  return (
    <main id="main-content" className={`site-shell ${styles.page}`}>
      <div className={styles.column}>
        <header className="page-head">
          <p className="page-head__kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>
        <PageSections sections={copy.faq} />
        <ContactForm copy={copy.contact} locale={locale} privacyHref={localizedPath("/privacy", locale)} />
        <nav aria-label={copy.relatedLabel} className={styles.related}>
          <Link href={localizedPath("/privacy", locale)} prefetch={false}>{copy.privacy}</Link>
          <Link href={localizedPath("/terms", locale)} prefetch={false}>{copy.terms}</Link>
        </nav>
      </div>
    </main>
  );
}
