import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsletterCampaignForm } from "@/components/studio/newsletter-campaigns/campaign-form";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioNewsletterCampaignService } from "@/modules/newsletter-delivery/container";

export const dynamic = "force-dynamic";

export default async function NewNewsletterCampaignPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requireEditor(locale);
  const service = await getStudioNewsletterCampaignService();
  const title = locale === "it" ? "Nuova campagna" : "New campaign";

  return (
    <>
      <header className="studio-page-header">
        <div>
          <Link className="studio-back-link" href={`/${locale}/studio/newsletter/campaigns`}>
            <ChevronLeft aria-hidden="true" size={16} />
            {locale === "it" ? "Campagne" : "Campaigns"}
          </Link>
          <h1>{title}</h1>
        </div>
      </header>
      <NewsletterCampaignForm defaults={service.defaults()} locale={locale} />
    </>
  );
}
