import { MailPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, sentenceCase } from "@/components/studio/badge";
import { campaignStatusTone } from "@/components/studio/newsletter-campaigns/campaign-status";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioNewsletterCampaignService } from "@/server/composition";
import { NewsletterDeliveryConfigurationError } from "@atlasnews/core/newsletter/domain/newsletter";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "Campaigns",
    description: "Compose, schedule and monitor consent-safe email delivery.",
    create: "New campaign",
    empty: "No campaigns yet",
    emptyBody: "Create a draft to prepare the next briefing.",
    recipients: "recipients",
    delivered: "delivered",
    failed: "failed",
    subject: "Subject",
    status: "Status",
    updated: "Updated",
    unavailable: "Campaign delivery is not configured.",
  },
  it: {
    title: "Campagne",
    description: "Componi, programma e monitora consegne email basate sul consenso.",
    create: "Nuova campagna",
    empty: "Nessuna campagna",
    emptyBody: "Crea una bozza per preparare il prossimo briefing.",
    recipients: "destinatari",
    delivered: "consegnate",
    failed: "fallite",
    subject: "Oggetto",
    status: "Stato",
    updated: "Aggiornata",
    unavailable: "La consegna campagne non è configurata.",
  },
} as const;

export default async function NewsletterCampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requireEditor(locale);
  const labels = copy[locale];

  let campaigns;
  try {
    campaigns = await (await getStudioNewsletterCampaignService()).listCampaigns({ locale });
  } catch (error) {
    if (!(error instanceof NewsletterDeliveryConfigurationError)) throw error;
    return (
      <>
        <PageHead description={labels.description} title={labels.title} />
        <Note tone="warning">{labels.unavailable}</Note>
      </>
    );
  }
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

  return (
    <>
      <PageHead description={labels.description} title={labels.title}>
        <Link className="button button--primary" href={`/${locale}/studio/newsletter/campaigns/new`}>
          <MailPlus aria-hidden="true" />
          {labels.create}
        </Link>
      </PageHead>

      {campaigns.items.length ? (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead>
              <tr>
                <th>{labels.subject}</th>
                <th>{labels.status}</th>
                <th>{labels.recipients}</th>
                <th>{labels.delivered}</th>
                <th>{labels.failed}</th>
                <th>{labels.updated}</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.items.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="studio-table__main">
                    <Link className="studio-cell" href={`/${locale}/studio/newsletter/campaigns/${campaign.id}`}>
                      <strong>{campaign.subject}</strong>
                    </Link>
                  </td>
                  <td data-label={labels.status}><Badge tone={campaignStatusTone(campaign.status)}>{sentenceCase(campaign.status)}</Badge></td>
                  <td data-label={labels.recipients}>{campaign.recipientCount}</td>
                  <td data-label={labels.delivered}>{campaign.deliveredCount}</td>
                  <td data-label={labels.failed}>{campaign.failureCount + campaign.bounceCount}</td>
                  <td data-label={labels.updated}>
                    <time dateTime={campaign.updatedAt}>{when.format(new Date(campaign.updatedAt))} UTC</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <h2>{labels.empty}</h2>
          <p>{labels.emptyBody}</p>
        </div>
      )}
    </>
  );
}
