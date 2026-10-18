import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import "@/styles/site/shell.css";
import "@/styles/site/feed.css";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteTools } from "@/components/site/site-tools/site-tools";
import { getMessages, isLocale } from "@/i18n";

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
      {children}
      <div className="site-shell">
        <NewsletterForm locale={locale} copy={getMessages(locale).newsletter} icon={<Mail aria-hidden="true" />} source={`site-${locale}`} />
      </div>
      <SiteFooter locale={locale} />
      <SiteTools />
    </>
  );
}
