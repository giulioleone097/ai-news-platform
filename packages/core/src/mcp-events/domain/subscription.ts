import type {
  ArticlePublishedArguments,
  McpEventName,
  McpWebhookEvent,
} from "./events";

export type SubscriptionStatus = "active" | "unsubscribed" | "gone";

/** What the stores allow in `principal`. */
export const maximumPrincipalLength = 80;

export interface EventSubscription {
  id: string;
  /** The signed-in caller that owns the subscription; it scopes the id, the verification cache and the cap. */
  principal: string;
  eventName: McpEventName;
  arguments: ArticlePublishedArguments;
  url: string;
  host: string;
  secret: string;
  previousSecret: string | null;
  previousSecretExpiresAt: string | null;
  status: SubscriptionStatus;
  expiresAt: string;
  /** Last successful callback verification; subscriptions are only stored after one. */
  verifiedAt: string;
  /** Articles published at or before this instant are never delivered to the subscription. */
  checkpoint: string;
  createdAt: string;
  updatedAt: string;
}

export function isSubscriptionLive(subscription: EventSubscription, now: Date) {
  return subscription.status === "active" && Date.parse(subscription.expiresAt) > now.getTime();
}

/** Secrets that currently sign deliveries: the active one plus the previous one during rotation. */
export function activeSigningSecrets(subscription: EventSubscription, now: Date) {
  const rotating = subscription.previousSecret
    && subscription.previousSecretExpiresAt
    && Date.parse(subscription.previousSecretExpiresAt) > now.getTime();
  return rotating ? [subscription.secret, subscription.previousSecret as string] : [subscription.secret];
}

export interface NewDelivery {
  subscriptionId: string;
  articleId: string;
  eventId: string;
  event: McpWebhookEvent;
}

export interface ClaimedDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  event: McpWebhookEvent;
  attempts: number;
  maxAttempts: number;
}
