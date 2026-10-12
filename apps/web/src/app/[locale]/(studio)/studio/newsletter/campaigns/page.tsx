import { MailPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/studio/badge";
import { campaignStatusLabels, campaignStatusTone } from "@/components/studio/newsletter-campaigns/campaign-status";
import { OffNote } from "@/components/studio/note";
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
    offTitle: "Campaigns are off",
    offBody: "Compose, schedule and send the briefing to confirmed subscribers.",
    offNext: "An admin turns them on in the Site settings.",
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
    offTitle: "Le campagne sono disattivate",
    offBody: "Componi, programma e invia il briefing agli iscritti confermati.",
    offNext: "Un amministratore le attiva nelle Impostazioni del sito.",
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
        <OffNote body={labels.offBody} next={labels.offNext} title={labels.offTitle} />
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
                <th className="studio-num">{labels.recipients}</th>
                <th className="studio-num">{labels.delivered}</th>
                <th className="studio-num">{labels.failed}</th>
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
                  <td data-label={labels.status}><Badge tone={campaignStatusTone(campaign.status)}>{campaignStatusLabels[locale][campaign.status]}</Badge></td>
                  <td className="studio-num" data-label={labels.recipients}>{campaign.recipientCount || null}</td>
                  <td className="studio-num" data-label={labels.delivered}>{campaign.deliveredCount || null}</td>
                  <td className="studio-num" data-label={labels.failed}>{campaign.failureCount + campaign.bounceCount || null}</td>
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
