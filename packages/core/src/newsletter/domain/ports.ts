import type {
  NewsletterCampaign,
  NewsletterCampaignInput,
  NewsletterCampaignRecipient,
  NewsletterCampaignSummary,
  NewsletterOutboxDelivery,
  NewsletterProviderEvent,
} from "./newsletter";

export type NewsletterCampaignPage = {
  items: NewsletterCampaignSummary[];
  total: number;
};

/** The campaigns an editor writes and sends. */
export interface NewsletterCampaignRepository {
  listCampaigns(input: {
    locale: "en" | "it";
    limit?: number;
    offset?: number;
  }): Promise<NewsletterCampaignPage>;
  getCampaign(id: string): Promise<NewsletterCampaign | null>;
  listRecipients(campaignId: string, limit?: number): Promise<NewsletterCampaignRecipient[]>;
  saveDraft(input: NewsletterCampaignInput, createdBy: string): Promise<NewsletterCampaign>;
  /** Removes a campaign that is still a draft; false when no draft has this id. */
  deleteDraft(id: string): Promise<boolean>;
  queueCampaign(id: string, scheduledFor: string | null): Promise<NewsletterCampaign>;
  cancelCampaign(id: string): Promise<NewsletterCampaign>;
}

/** The queue the delivery worker drains: claim a message, send it, report how it went. */
export interface NewsletterOutboxRepository {
  claimOutbox(input: {
    limit: number;
    workerId: string;
    leaseSeconds: number;
  }): Promise<NewsletterOutboxDelivery[]>;
  startOutboxDelivery(input: {
    outboxId: number;
    workerId: string;
  }): Promise<boolean>;
  completeOutbox(input: {
    outboxId: number;
    workerId: string;
    providerMessageId: string;
  }): Promise<boolean>;
  failOutbox(input: {
    outboxId: number;
    workerId: string;
    error: string;
    retryable: boolean;
    retryAfterSeconds: number;
  }): Promise<boolean>;
}

/** What the email provider reports back: delivered, opened, bounced, complained. */
export interface NewsletterProviderEventRepository {
  recordProviderEvent(event: NewsletterProviderEvent): Promise<boolean>;
  registerSuppression(input: {
    providerMessageId: string;
    emailHash: string;
    reason: "bounce" | "complaint";
  }): Promise<boolean>;
}

/** A reader's subscription: the double opt-in, unsubscribing and erasure. */
export interface NewsletterSubscriptionFlowRepository {
  requestSubscription(input: {
    email: string;
    source: string;
    locale: "en" | "it";
    tokenHash: string;
    emailHash: string;
    requestFingerprint: string;
    expiresAt: string;
  }): Promise<{ subscriptionId: string | null; status: string; shouldSend: boolean }>;
  completeSubscriptionConfirmation(input: {
    subscriptionId: string;
    tokenHash: string;
    providerMessageId: string;
  }): Promise<boolean>;
  releaseSubscriptionConfirmation(input: {
    subscriptionId: string;
    tokenHash: string;
  }): Promise<boolean>;
  confirmSubscription(input: { subscriptionId: string; tokenHash: string }): Promise<boolean>;
  unsubscribe(input: { subscriptionId: string; recipientId: string }): Promise<boolean>;
  getSubscriptionEmail(subscriptionId: string): Promise<string | null>;
  eraseSubscription(input: { subscriptionId: string; emailHash: string }): Promise<boolean>;
}

/** Everything a backend stores for the newsletter; the services take it whole, adapters implement it a port at a time. */
export type NewsletterDeliveryRepository = NewsletterCampaignRepository
  & NewsletterOutboxRepository
  & NewsletterProviderEventRepository
  & NewsletterSubscriptionFlowRepository;

export type NewsletterProviderMessage = {
  fromName: string;
  fromEmail: string;
  to: string;
  replyTo: string | null;
  subject: string;
  html: string;
  idempotencyKey: string;
  unsubscribeUrl: string;
};

export interface NewsletterDeliveryProvider {
  send(message: NewsletterProviderMessage): Promise<{ messageId: string }>;
  sendConfirmation(message: {
    fromEmail: string;
    to: string;
    subject: string;
    html: string;
    replyTo: string | null;
    idempotencyKey: string;
  }): Promise<{ messageId: string }>;
}
