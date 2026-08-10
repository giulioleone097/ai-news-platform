import { ChevronLeft, Mail, MousePointerClick, Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { NewsletterCampaignForm } from "@/components/studio/newsletter-campaigns/campaign-form";
import {
  campaignStatusClass,
  deliveryStatusClass,
} from "@/components/studio/newsletter-campaigns/campaign-status";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioNewsletterCampaignService } from "@/modules/newsletter-delivery/container";

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

  return (
    <>
      <header className="studio-page-header">
        <div>
          <Link className="studio-back-link" href={`/${locale}/studio/newsletter/campaigns`}>
            <ChevronLeft aria-hidden="true" size={16} /> {labels.campaigns}
          </Link>
          <h1>{campaign.subject}</h1>
          <p><span className={campaignStatusClass(campaign.status)}>{campaign.status}</span></p>
        </div>
      </header>

      <section className="studio-newsletter-metrics" aria-label={labels.delivery}>
        <article><span className="studio-capability-card__icon"><Mail aria-hidden="true" size={22} /></span><strong>{campaign.recipientCount}</strong><p>{labels.recipients}</p></article>
        <article><span className="studio-capability-card__icon"><Send aria-hidden="true" size={22} /></span><strong>{campaign.sentCount} / {campaign.deliveredCount}</strong><p>{labels.sent} / {labels.delivered}</p></article>
        <article><span className="studio-capability-card__icon"><MousePointerClick aria-hidden="true" size={22} /></span><strong>{campaign.openCount} / {campaign.clickCount}</strong><p>{labels.engagement}</p></article>
        <article><span className="studio-capability-card__icon"><ShieldAlert aria-hidden="true" size={22} /></span><strong>{campaign.bounceCount} / {campaign.complaintCount}</strong><p>{labels.incidents}</p></article>
      </section>

      <NewsletterCampaignForm campaign={campaign} defaults={service.defaults()} locale={locale} />

      {campaign.status !== "draft" ? (
        <section className="studio-panel" aria-labelledby="campaign-preview-title">
          <div className="studio-panel__heading"><span>05</span><h2 id="campaign-preview-title">{labels.preview}</h2></div>
          <MarkdownRenderer className="markdown-content" content={campaign.contentMarkdown} />
        </section>
      ) : null}

      {recipients.length ? (
        <section className="studio-audience-list" aria-label={labels.delivery}>
          {recipients.map((recipient) => (
            <article key={recipient.id}>
              <div className="studio-audience-list__identity">
                <strong>{recipient.email}</strong>
                <span className={deliveryStatusClass(recipient.deliveryStatus)}>{recipient.deliveryStatus}</span>
              </div>
              {recipient.lastError ? <p className="studio-field__error">{recipient.lastError}</p> : null}
              {recipient.providerMessageId ? <code>{recipient.providerMessageId}</code> : null}
            </article>
          ))}
        </section>
      ) : (
        <div className="studio-empty-state"><Mail aria-hidden="true" size={28} /><h2>{labels.delivery}</h2><p>{labels.empty}</p></div>
      )}
    </>
  );
}
