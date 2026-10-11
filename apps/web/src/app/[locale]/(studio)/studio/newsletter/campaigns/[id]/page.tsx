import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { NewsletterCampaignForm } from "@/components/studio/newsletter-campaigns/campaign-form";
import { Badge, sentenceCase } from "@/components/studio/badge";
import {
  campaignStatusTone,
  deliveryStatusTone,
} from "@/components/studio/newsletter-campaigns/campaign-status";
import { PageHead } from "@/components/studio/page-head";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioNewsletterCampaignService } from "@/server/composition";

export const dynamic = "force-dynamic";

export default async function NewsletterCampaignPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  await requireEditor(locale);
  const service = await getStudioNewsletterCampaignService();
  const campaign = await service.getCampaign(id);
  if (!campaign || campaign.locale !== locale) notFound();
  const recipients = campaign.recipientCount ? await service.listRecipients(campaign.id, 100) : [];
  const labels = locale === "it"
    ? { campaigns: "Campagne", recipients: "Destinatari", sent: "Inviate", delivered: "Consegnate", engagement: "Interazioni", incidents: "Bounce / reclami", preview: "Anteprima email", delivery: "Consegna destinatari", empty: "La snapshot destinatari verrà creata quando la campagna entra in coda." }
    : { campaigns: "Campaigns", recipients: "Recipients", sent: "Sent", delivered: "Delivered", engagement: "Engagement", incidents: "Bounces / complaints", preview: "Email preview", delivery: "Recipient delivery", empty: "The recipient snapshot is created when the campaign enters the queue." };

  const recipientLabels = locale === "it" ? { email: "Email", status: "Stato" } : { email: "Email", status: "Status" };
  const stats = [
    { label: labels.recipients, value: campaign.recipientCount },
    { label: `${labels.sent} / ${labels.delivered}`, value: `${campaign.sentCount} / ${campaign.deliveredCount}` },
    { label: labels.engagement, value: `${campaign.openCount} / ${campaign.clickCount}` },
    { label: labels.incidents, value: `${campaign.bounceCount} / ${campaign.complaintCount}` },
  ];

  return (
    <>
      <PageHead
        back={{ href: `/${locale}/studio/newsletter/campaigns`, label: labels.campaigns }}
        badge={<Badge tone={campaignStatusTone(campaign.status)}>{sentenceCase(campaign.status)}</Badge>}
        title={campaign.subject}
      />

      <dl aria-label={labels.delivery} className="studio-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <NewsletterCampaignForm campaign={campaign} defaults={service.defaults()} locale={locale} />

      {campaign.status !== "draft" ? (
        <section className="studio-section" aria-labelledby="campaign-preview-title">
          <h2 className="studio-section__title" id="campaign-preview-title">{labels.preview}</h2>
          <MarkdownRenderer className="markdown-content" content={campaign.contentMarkdown} labels={getMessages(locale).markdown} />
        </section>
      ) : null}

      <section className="studio-section" aria-labelledby="campaign-delivery-title">
        <h2 className="studio-section__title" id="campaign-delivery-title">{labels.delivery}</h2>
        {recipients.length ? (
          <div className="studio-table-wrap">
            <table className="studio-table">
              <thead>
                <tr>
                  <th>{recipientLabels.email}</th>
                  <th>{recipientLabels.status}</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="studio-table__main">
                      <div className="studio-cell">
                        <strong>{recipient.email}</strong>
                        {recipient.lastError ? <small className="studio-field__error">{recipient.lastError}</small> : null}
                        {recipient.providerMessageId ? <small>{recipient.providerMessageId}</small> : null}
                      </div>
                    </td>
                    <td data-label={recipientLabels.status}>
                      <Badge tone={deliveryStatusTone(recipient.deliveryStatus)}>{sentenceCase(recipient.deliveryStatus)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="studio-muted">{labels.empty}</p>
        )}
      </section>
    </>
  );
}
