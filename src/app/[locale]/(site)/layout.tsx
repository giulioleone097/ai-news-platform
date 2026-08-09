import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { isLocale } from "@/i18n";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <>
      <SiteHeader locale={locale} />
      <ViewTransition enter="neura-page-enter" exit="neura-page-exit">
        {children}
      </ViewTransition>
      <SiteFooter locale={locale} />
    </>
  );
}
