import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/site/support/legal-page";
import { termsCopy } from "@/components/site/support/support-copy";
import { getAlternates, isLocale } from "@/i18n";
import { agentAlternateTypes } from "@/lib/alternates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = termsCopy[locale];
  return {
    title: copy.title,
    description: copy.description,
    alternates: { ...getAlternates("/terms", locale), types: agentAlternateTypes(locale) },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <LegalPage copy={termsCopy[locale]} locale={locale} other="privacy" />;
}
