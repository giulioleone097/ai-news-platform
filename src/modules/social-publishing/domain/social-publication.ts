export const socialProviders = ["linkedin", "x", "whatsapp"] as const;
export const socialOutboxStatuses = ["pending", "processing", "sent", "failed", "cancelled"] as const;
export const whatsappProviderStatuses = ["sent", "delivered", "read", "failed"] as const;

export type SocialProvider = (typeof socialProviders)[number];
export type SocialOutboxStatus = (typeof socialOutboxStatuses)[number];
export type WhatsAppProviderStatus = (typeof whatsappProviderStatuses)[number];

export interface SocialPublishPayload {
  text: string;
  articleUrl?: string;
  /** Required for WhatsApp. Never infer or default a recipient. */
  recipient?: string;
}

export interface SocialOutboxJob {
  id: string;
  publicationId: string;
  provider: SocialProvider;
  idempotencyKey: string;
  payload: SocialPublishPayload;
  status: SocialOutboxStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  dispatchStartedAt: string | null;
  providerMessageId: string | null;
  providerUrl: string | null;
  providerStatus: string | null;
  providerStatusAt: string | null;
  revision: number;
  retrySafe: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  sentAt: string | null;
  failedAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueSocialPublicationInput {
  publicationId: string;
  provider: SocialProvider;
  payload: SocialPublishPayload;
  idempotencyKey?: string;
  scheduledFor?: string | null;
  maxAttempts?: number;
}

export interface RequeueSocialPublicationInput
  extends Omit<EnqueueSocialPublicationInput, "idempotencyKey"> {
  id: string;
  expectedRevision: number;
}

export interface SocialOutboxQuery {
  provider?: SocialProvider;
  status?: SocialOutboxStatus;
  limit?: number;
  offset?: number;
}

export interface SocialOutboxPage {
  items: SocialOutboxJob[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SocialProviderResult {
  messageId: string;
  url: string | null;
  status: string;
}

export interface SocialProviderContext {
  idempotencyKey: string;
}

export interface SocialProviderAdapter {
  readonly provider: SocialProvider;
  validate(payload: SocialPublishPayload): void;
  publish(
    payload: SocialPublishPayload,
    context: SocialProviderContext,
  ): Promise<SocialProviderResult>;
}

export function publicSocialOutboxJob(job: SocialOutboxJob) {
  return {
    id: job.id,
    publicationId: job.publicationId,
    provider: job.provider,
    idempotencyKey: job.idempotencyKey,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    availableAt: job.availableAt,
    providerMessageId: job.providerMessageId,
    providerUrl: job.providerUrl,
    providerStatus: job.providerStatus,
    providerStatusAt: job.providerStatusAt,
    revision: job.revision,
    retrySafe: job.retrySafe,
    lastErrorCode: job.lastErrorCode,
    lastErrorMessage: job.lastErrorMessage,
    sentAt: job.sentAt,
    failedAt: job.failedAt,
    deliveredAt: job.deliveredAt,
    readAt: job.readAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
