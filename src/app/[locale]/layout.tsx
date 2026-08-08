import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "../design.tokens.css";
import "../globals.css";
import { getPublicSiteUrl } from "@/config/env";
import {
  getAlternates,
  getMessages,
  isLocale,
  locales,
  localizedPath,
} from "@/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const messages = getMessages(locale);
  const alternates = getAlternates("/", locale);

  return {
    metadataBase: getPublicSiteUrl(),
    title: {
      default: messages.metadata.siteTitle,
      template: messages.metadata.titleTemplate,
    },
    description: messages.metadata.siteDescription,
    applicationName: messages.common.brandName,
    alternates: {
      ...alternates,
      types: { "application/rss+xml": localizedPath("/feed.xml", locale) },
    },
    openGraph: {
      type: "website",
      locale: messages.metadata.openGraphLocale,
      alternateLocale: locale === "en" ? ["it_IT"] : ["en_US"],
      siteName: messages.common.brandName,
      images: [{ url: "/media/neura-agents-hero.webp", width: 1536, height: 1024 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
