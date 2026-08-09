import type { Locale } from "@/i18n";
import type { SocialChannel } from "./article";

export const distributionStatuses = ["draft", "ready", "published", "failed"] as const;
export const newsletterStatuses = ["active", "unsubscribed"] as const;

export type DistributionStatus = (typeof distributionStatuses)[number];
export type NewsletterStatus = (typeof newsletterStatuses)[number];

export interface DistributionPublication {
  id: string;
  articleId: string;
  articleLocale: Locale;
  articleSlug: string;
  articleTitle: string;
  channel: SocialChannel;
  status: DistributionStatus;
  message: string;
  externalUrl: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface DistributionUpdate {
  id: string;
  status: DistributionStatus;
  message?: string;
  externalUrl?: string | null;
  scheduledFor?: string | null;
}

export interface NewsletterSubscription {
  id: string;
  email: string;
  source: string;
  locale: Locale;
  status: NewsletterStatus;
  consentedAt: string;
  unsubscribedAt: string | null;
  createdAt: string;
}

export interface NewsletterQuery {
  locale: Locale;
  query?: string;
  status?: NewsletterStatus;
  limit?: number;
  offset?: number;
}

export interface NewsletterPage {
  items: NewsletterSubscription[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface MediaAsset {
  path: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface MediaUpload {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}
