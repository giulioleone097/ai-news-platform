import type { Locale } from "../../locale";
import type { SocialChannel } from "./article";

export const distributionStatuses = ["draft", "ready", "published", "failed"] as const;
/**
 * Lifecycle of a subscriber under double opt-in: `pending` until the confirmation link is used,
 * `active` once confirmed, `unsubscribed` by the reader or an editor, and `suppressed` after a
 * bounce, complaint or erasure (set by delivery events, never by an editor).
 */
export const newsletterStatuses = ["pending", "active", "unsubscribed", "suppressed"] as const;

export type DistributionStatus = (typeof distributionStatuses)[number];
export type NewsletterStatus = (typeof newsletterStatuses)[number];

export type NewsletterEditorAction = "unsubscribe" | "reconfirm";

/** The only status an editor sets directly; every way back to `active` goes through a fresh confirmation email. */
export function isEditorSettableNewsletterStatus(status: NewsletterStatus): status is "unsubscribed" {
  return status === "unsubscribed";
}

/**
 * What an editor may do to a subscriber in this state. `unsubscribe` is allowed for anyone not
 * suppressed. `reconfirm` sends a fresh double opt-in email, which only makes sense for a subscriber
 * who is not yet (or no longer) confirmed; suppressed addresses cannot be re-subscribed from the Studio.
 */
export function newsletterEditorActions(status: NewsletterStatus): NewsletterEditorAction[] {
  switch (status) {
    case "pending": return ["unsubscribe", "reconfirm"];
    case "active": return ["unsubscribe"];
    case "unsubscribed": return ["reconfirm"];
    case "suppressed": return [];
  }
}

/** Whether an editor may move a subscriber from `from` to `to` directly (unsubscribing twice is a no-op). */
export function canEditorSetNewsletterStatus(from: NewsletterStatus, to: NewsletterStatus) {
  return isEditorSettableNewsletterStatus(to) && from !== "suppressed";
}

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

/**
 * The publication a social post is about: one of those listed for the editor's locale (`publications`), and for
 * the channel the post goes to when one is given. Nothing else may be queued, so a post cannot name another
 * language's article or a channel the publication was not made for.
 */
export function findPublication(
  publications: readonly DistributionPublication[],
  id: string,
  channel?: string,
): DistributionPublication | null {
  return publications.find((publication) => publication.id === id && (channel === undefined || publication.channel === channel)) ?? null;
}

/**
 * The address a social post links to: the article on the public site. Only a public https site has one, so
 * a post never carries a local, insecure or credentialed address.
 */
export function canonicalArticleUrl(site: URL, locale: Locale, slug: string): string | undefined {
  if (site.protocol !== "https:" || site.username || site.password) return undefined;
  return new URL(`/${locale}/articles/${encodeURIComponent(slug)}`, site).toString();
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
