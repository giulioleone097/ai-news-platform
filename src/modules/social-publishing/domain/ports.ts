import type {
  EnqueueSocialPublicationInput,
  RequeueSocialPublicationInput,
  SocialOutboxJob,
  SocialOutboxPage,
  SocialOutboxQuery,
  SocialProvider,
  SocialProviderAdapter,
  SocialProviderResult,
  WhatsAppProviderStatus,
} from "./social-publication";

export interface SocialOutboxRepository {
  enqueue(input: Required<Pick<EnqueueSocialPublicationInput,
    "publicationId" | "provider" | "payload" | "idempotencyKey"
  >> & {
    scheduledFor: string | null;
    maxAttempts: number;
  }): Promise<SocialOutboxJob>;
  requeue(input: RequeueSocialPublicationInput & {
    scheduledFor: string | null;
    maxAttempts: number;
  }): Promise<SocialOutboxJob>;
  getById(id: string): Promise<SocialOutboxJob | null>;
  getByIdempotencyKey(idempotencyKey: string): Promise<SocialOutboxJob | null>;
  list(query: Required<Pick<SocialOutboxQuery, "limit" | "offset">> & SocialOutboxQuery): Promise<SocialOutboxPage>;
  cancelPending(id: string): Promise<SocialOutboxJob>;
  retryFailed(id: string): Promise<SocialOutboxJob>;
  claim(input: {
    workerToken: string;
    limit: number;
    leaseSeconds: number;
  }): Promise<SocialOutboxJob[]>;
  markDispatchStarted(id: string, workerToken: string): Promise<SocialOutboxJob>;
  markSent(
    id: string,
    workerToken: string,
    result: SocialProviderResult,
  ): Promise<SocialOutboxJob>;
  markRetry(input: {
    id: string;
    workerToken: string;
    availableAt: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SocialOutboxJob>;
  markFailed(input: {
    id: string;
    workerToken: string;
    errorCode: string;
    errorMessage: string;
    retrySafe: boolean;
  }): Promise<SocialOutboxJob>;
  applyProviderStatus(input: {
    provider: "whatsapp";
    providerMessageId: string;
    status: WhatsAppProviderStatus;
    occurredAt: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<SocialOutboxJob | null>;
}

export interface SocialProviderRegistry {
  get(provider: SocialProvider): SocialProviderAdapter;
}
