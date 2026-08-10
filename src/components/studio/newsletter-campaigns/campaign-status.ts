import type {
  NewsletterCampaignStatus,
  NewsletterDeliveryStatus,
} from "@/modules/newsletter-delivery/domain";

export function campaignStatusClass(status: NewsletterCampaignStatus) {
  if (status === "sent") return "studio-status studio-status--published";
  if (status === "sending") return "studio-status studio-status--ready";
  if (status === "cancelled") return "studio-status studio-status--failed";
  return `studio-status studio-status--${status}`;
}

export function deliveryStatusClass(status: NewsletterDeliveryStatus) {
  if (status === "delivered") return "studio-status studio-status--published";
  if (status === "sent" || status === "sending") return "studio-status studio-status--ready";
  if (status === "bounced" || status === "complained" || status === "failed" || status === "cancelled") {
    return "studio-status studio-status--failed";
  }
  return "studio-status studio-status--draft";
}
