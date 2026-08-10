import { MailPlus, Send, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { campaignStatusClass } from "@/components/studio/newsletter-campaigns/campaign-status";
import { isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioNewsletterCampaignService } from "@/modules/newsletter-delivery/container";
import { NewsletterDeliveryConfigurationError } from "@/modules/newsletter-delivery/domain";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    kicker: "Newsletter",
    title: "Campaigns",
    description: "Compose, schedule and monitor consent-safe email delivery.",
    create: "New campaign",
    empty: "No campaigns yet",
    emptyBody: "Create a draft to prepare the next briefing.",
    recipients: "recipients",
    delivered: "delivered",
    failed: "failed",
    unavailable: "Campaign delivery is not configured.",
  },
  it: {
    kicker: "Newsletter",
    title: "Campagne",
    description: "Componi, programma e monitora consegne email basate sul consenso.",
    create: "Nuova campagna",
    empty: "Nessuna campagna",
    emptyBody: "Crea una bozza per preparare il prossimo briefing.",
    recipients: "destinatari",
    delivered: "consegnate",
    failed: "fallite",
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
        <header className="studio-page-header"><div><p className="studio-kicker">{labels.kicker}</p><h1>{labels.title}</h1><p>{labels.description}</p></div></header>
        <p className="studio-alert studio-alert--error" role="alert">{labels.unavailable}</p>
      </>
    );
  }

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{labels.kicker}</p>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <Link className="studio-button studio-button--primary" href={`/${locale}/studio/newsletter/campaigns/new`}>
          <MailPlus aria-hidden="true" size={16} />
          {labels.create}
        </Link>
      </header>

      {campaigns.items.length ? (
        <section className="studio-audience-list" aria-label={labels.title}>
          {campaigns.items.map((campaign) => (
            <article key={campaign.id}>
              <div className="studio-audience-list__identity">
                <strong><Link href={`/${locale}/studio/newsletter/campaigns/${campaign.id}`}>{campaign.subject}</Link></strong>
                <span className={campaignStatusClass(campaign.status)}>{campaign.status}</span>
              </div>
              <dl>
                <div><dt><Users aria-hidden="true" size={14} /> {labels.recipients}</dt><dd>{campaign.recipientCount}</dd></div>
                <div><dt><Send aria-hidden="true" size={14} /> {labels.delivered}</dt><dd>{campaign.deliveredCount}</dd></div>
                <div><dt>{labels.failed}</dt><dd>{campaign.failureCount + campaign.bounceCount}</dd></div>
              </dl>
              <time dateTime={campaign.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(campaign.updatedAt))} UTC</time>
            </article>
          ))}
        </section>
      ) : (
        <div className="studio-empty-state">
          <MailPlus aria-hidden="true" size={28} />
          <h2>{labels.empty}</h2>
          <p>{labels.emptyBody}</p>
        </div>
      )}
    </>
  );
}
