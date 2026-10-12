import type {
  NewsletterCampaignStatus,
  NewsletterDeliveryStatus,
} from "@atlasnews/core/newsletter/domain/newsletter";
import type { Locale } from "@atlasnews/core/locale";
import type { BadgeTone } from "../badge";

export function campaignStatusTone(status: NewsletterCampaignStatus): BadgeTone {
  if (status === "sent") return "success";
  if (status === "sending" || status === "scheduled") return "info";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export function deliveryStatusTone(status: NewsletterDeliveryStatus): BadgeTone {
  if (status === "delivered") return "success";
  if (status === "sent" || status === "sending") return "info";
  if (status === "bounced" || status === "complained" || status === "failed" || status === "cancelled") return "danger";
  return "neutral";
}

export const campaignStatusLabels: Record<Locale, Record<NewsletterCampaignStatus, string>> = {
  en: { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", cancelled: "Cancelled" },
  it: { draft: "Bozza", scheduled: "Programmata", sending: "In invio", sent: "Inviata", cancelled: "Annullata" },
};

export const deliveryStatusLabels: Record<Locale, Record<NewsletterDeliveryStatus, string>> = {
  en: {
    pending: "Pending",
    sending: "Sending",
    sent: "Sent",
    delivered: "Delivered",
    bounced: "Bounced",
    complained: "Marked as spam",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  it: {
    pending: "In attesa",
    sending: "In invio",
    sent: "Inviata",
    delivered: "Consegnata",
    bounced: "Respinta",
    complained: "Segnalata come spam",
    failed: "Non riuscita",
    cancelled: "Annullata",
  },
};
