import { notFound, redirect } from "next/navigation";
import { NewsletterCampaignForm } from "@/components/studio/newsletter-campaigns/campaign-form";
import { PageHead } from "@/components/studio/page-head";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioNewsletterCampaignService } from "@/server/composition";
import { NewsletterDeliveryConfigurationError } from "@atlasnews/core/newsletter/domain/newsletter";

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
  // Without a delivery account the list explains how to turn campaigns on; a form or a detail would only fail.
  const service = await getStudioNewsletterCampaignService().catch((error: unknown) => {
    if (error instanceof NewsletterDeliveryConfigurationError) redirect(`/${locale}/studio/newsletter/campaigns`);
    throw error;
  });
  const title = locale === "it" ? "Nuova campagna" : "New campaign";

  return (
    <>
      <PageHead
        back={{ href: `/${locale}/studio/newsletter/campaigns`, label: locale === "it" ? "Campagne" : "Campaigns" }}
        title={title}
      />
      <NewsletterCampaignForm defaults={service.defaults()} locale={locale} />
    </>
  );
}
