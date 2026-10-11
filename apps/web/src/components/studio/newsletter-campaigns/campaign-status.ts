import type {
  NewsletterCampaignStatus,
  NewsletterDeliveryStatus,
} from "@atlasnews/core/newsletter/domain/newsletter";
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
