import type {
  NewsletterCampaign,
  NewsletterCampaignInput,
  NewsletterCampaignRecipient,
  NewsletterCampaignSummary,
  NewsletterOutboxDelivery,
  NewsletterProviderEvent,
} from "./domain";

export type NewsletterCampaignPage = {
  items: NewsletterCampaignSummary[];
  total: number;
};

export interface NewsletterDeliveryRepository {
  listCampaigns(input: {
    locale: "en" | "it";
    limit?: number;
    offset?: number;
  }): Promise<NewsletterCampaignPage>;
  getCampaign(id: string): Promise<NewsletterCampaign | null>;
  listRecipients(campaignId: string, limit?: number): Promise<NewsletterCampaignRecipient[]>;
  saveDraft(input: NewsletterCampaignInput, createdBy: string): Promise<NewsletterCampaign>;
  queueCampaign(id: string, scheduledFor: string | null): Promise<NewsletterCampaign>;
  cancelCampaign(id: string): Promise<NewsletterCampaign>;
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
  recordProviderEvent(event: NewsletterProviderEvent): Promise<boolean>;
  registerSuppression(input: {
    providerMessageId: string;
    emailHash: string;
    reason: "bounce" | "complaint";
  }): Promise<boolean>;
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
