import type { PublishedArticle } from "./events";
import type { Locale } from "../../locale";
import type {
  ClaimedDelivery,
  EventSubscription,
  NewDelivery,
  SubscriptionStatus,
} from "./subscription";

export interface McpEventsRepository {
  find(id: string): Promise<EventSubscription | null>;
  /** Insert or replace a subscription by id (idempotent subscribe/refresh). */
  save(subscription: EventSubscription): Promise<void>;
  /** Idempotent: unknown or already inactive ids are a no-op. */
  deactivate(id: string, status: Exclude<SubscriptionStatus, "active">): Promise<void>;
  countLiveForHost(host: string, excludingId: string, now: Date): Promise<number>;
  /** Live subscriptions whose callback host is `domain` or one of its subdomains. */
  countLiveForDomain(domain: string, excludingId: string, now: Date): Promise<number>;
  /** Live subscriptions owned by one principal. */
  countLiveForPrincipal(principal: string, excludingId: string, now: Date): Promise<number>;
  /** All live subscriptions, whoever owns them. */
  countLive(now: Date): Promise<number>;
  /** Verification time of a still-trusted prior verification for the same principal, URL and secret. */
  findVerifiedAt(input: {
    principal: string;
    url: string;
    secret: string;
    since: Date;
  }): Promise<string | null>;
  /** Live subscriptions, oldest checkpoint first, so that a run that reads `limit` of them serves the longest-waiting ones. */
  listLive(now: Date, limit: number): Promise<EventSubscription[]>;
  getMany(ids: string[]): Promise<EventSubscription[]>;
  /** Moves the checkpoint forward only. */
  advanceCheckpoint(id: string, checkpoint: string): Promise<void>;
  /** Idempotent per (subscriptionId, articleId); returns the number of newly queued deliveries. */
  enqueue(deliveries: NewDelivery[], maxAttempts: number, now: Date): Promise<number>;
  claim(input: {
    workerToken: string;
    limit: number;
    leaseSeconds: number;
    now: Date;
  }): Promise<ClaimedDelivery[]>;
  markDelivered(id: string, workerToken: string, now: Date): Promise<void>;
  markRetry(input: {
    id: string;
    workerToken: string;
    availableAt: string;
    errorCode: string;
  }): Promise<void>;
  markFailed(input: { id: string; workerToken: string; errorCode: string; now: Date }): Promise<void>;
  /** Subscription ended (expired, unsubscribed or gone) before the delivery was sent. */
  markCancelled(id: string, workerToken: string, now: Date): Promise<void>;
  /** Removes finished deliveries and inactive subscriptions that ended before the cutoff. */
  prune(before: Date): Promise<void>;
}

export interface WebhookRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export interface WebhookResponse {
  status: number;
  /** Response body, truncated by the client. */
  body: string;
}

/** SSRF-safe outbound HTTPS client; throws WebhookTransportError for transport failures. */
export interface WebhookClient {
  post(request: WebhookRequest): Promise<WebhookResponse>;
}

export interface PublishedArticleSource {
  /** Published articles of one locale newer than `after`, newest first. */
  listPublishedAfter(locale: Locale, after: Date): Promise<PublishedArticle[]>;
}
