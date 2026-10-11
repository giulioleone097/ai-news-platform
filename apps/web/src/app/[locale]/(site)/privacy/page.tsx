import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/site/support/legal-page";
import { privacyCopy } from "@/components/site/support/support-copy";
import { getAlternates, isLocale } from "@/i18n";
import { agentAlternateTypes } from "@/lib/alternates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = privacyCopy[locale];
  return {
    title: copy.title,
    description: copy.description,
    alternates: { ...getAlternates("/privacy", locale), types: agentAlternateTypes(locale) },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <LegalPage copy={privacyCopy[locale]} locale={locale} other="terms" />;
}
