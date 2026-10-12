import { invalidParams } from "../domain/errors";
import {
  articlePublishedArgumentsSchema,
  isMcpEventName,
  listMcpEventDefinitions,
  type ArticlePublishedArguments,
  type McpEventDefinition,
  type McpEventName,
} from "../domain/events";
import type { McpEventsRepository } from "../domain/ports";
import type { EventSubscription } from "../domain/subscription";
import { deriveSubscriptionId } from "./canonical-json";
import type { CallbackVerifier } from "./callback-verifier";
import { parseCallbackUrl } from "./callback-url";
import { registrableDomain } from "./registrable-domain";
import { decodeSigningSecret } from "./signing-secret";
import { grantSubscriptionTtl } from "./subscription-ttl";

/** Per signed-in caller: one account cannot fill the table for everyone else. */
export const maximumSubscriptionsPerPrincipal = 20;
export const maximumSubscriptionsPerHost = 25;
/** Across all subdomains of one registrable domain: wildcard DNS makes hostnames free. */
export const maximumSubscriptionsPerDomain = 100;
/**
 * Across everyone. The cron worker serves 100 subscriptions a minute, so this is also how long a
 * subscription can wait for its turn (1000 live subscriptions: ten minutes).
 */
export const maximumLiveSubscriptions = 1000;
export const verificationCacheMs = 24 * 60 * 60 * 1000;
export const secretRotationWindowMs = 60 * 60 * 1000;

export interface McpEventsLimits {
  perPrincipal: number;
  perHost: number;
  perDomain: number;
  total: number;
}

export interface SubscribeInput {
  /** The signed-in caller; the subscription belongs to it alone. */
  principal: string;
  name: string;
  arguments?: Record<string, unknown>;
  delivery: { mode: string; url: string; secret: string };
  ttlMs?: number | null;
}

export interface UnsubscribeInput {
  /** The signed-in caller; only its own subscription can be ended. */
  principal: string;
  name: string;
  arguments?: Record<string, unknown>;
  delivery: { mode: string; url: string };
}

export interface SubscribeResult {
  id: string;
  refreshBefore: string;
  cursor: null;
  truncated: false;
}

/** Use cases behind events/list, events/subscribe and events/unsubscribe. */
export interface McpEventsService {
  list(): Promise<{ events: McpEventDefinition[] }>;
  subscribe(input: SubscribeInput): Promise<SubscribeResult>;
  unsubscribe(input: UnsubscribeInput): Promise<Record<string, never>>;
}

function parseEventName(name: string): McpEventName {
  if (!isMcpEventName(name)) throw invalidParams(`Unknown event "${name}".`);
  return name;
}

function parseArguments(value: Record<string, unknown> | undefined): ArticlePublishedArguments {
  const parsed = articlePublishedArgumentsSchema.safeParse(value ?? {});
  if (!parsed.success) {
    throw invalidParams(`Invalid event arguments: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
  }
  return parsed.data;
}

function requireWebhook(mode: string) {
  if (mode !== "webhook") throw invalidParams("Only webhook delivery is supported.");
}

export class DefaultMcpEventsService implements McpEventsService {
  constructor(
    private readonly repository: McpEventsRepository,
    private readonly verifier: CallbackVerifier,
    private readonly clock: () => Date = () => new Date(),
    limits: Partial<McpEventsLimits> = {},
  ) {
    this.limits = {
      perPrincipal: limits.perPrincipal ?? maximumSubscriptionsPerPrincipal,
      perHost: limits.perHost ?? maximumSubscriptionsPerHost,
      perDomain: limits.perDomain ?? maximumSubscriptionsPerDomain,
      total: limits.total ?? maximumLiveSubscriptions,
    };
  }

  private readonly limits: McpEventsLimits;

  async list() {
    return { events: listMcpEventDefinitions() };
  }

  async subscribe(input: SubscribeInput): Promise<SubscribeResult> {
    const name = parseEventName(input.name);
    const args = parseArguments(input.arguments);
    requireWebhook(input.delivery.mode);
    const secret = input.delivery.secret;
    if (!decodeSigningSecret(secret)) {
      throw invalidParams("Signing secret must be whsec_ followed by base64 of 24 to 64 bytes.");
    }
    const url = parseCallbackUrl(input.delivery.url);
    const now = this.clock();
    const id = deriveSubscriptionId({ principal: input.principal, url: url.href, name, arguments: args });

    const existing = await this.repository.find(id);
    const wasLive = existing !== null && existing.status === "active"
      && Date.parse(existing.expiresAt) > now.getTime();
    if (!wasLive) await this.requireCapacity(input.principal, url.hostname, id, now);

    // A new secret on a live subscription is always proven again by the callback, never taken from the
    // verification cache: the cache would otherwise let a previously used secret be put back unchecked.
    const rotating = wasLive && existing !== null && existing.secret !== secret;
    const verifiedAt = await this.verifiedAt({ principal: input.principal, url: url.href, id, secret, now, cached: !rotating });
    const expiresAt = new Date(now.getTime() + grantSubscriptionTtl(input.ttlMs)).toISOString();
    await this.repository.save(this.merge({
      principal: input.principal, existing, wasLive, id, name, args, url, secret, expiresAt, verifiedAt, now,
    }));
    return { id, refreshBefore: expiresAt, cursor: null, truncated: false };
  }

  async unsubscribe(input: UnsubscribeInput) {
    const name = parseEventName(input.name);
    const args = parseArguments(input.arguments);
    requireWebhook(input.delivery.mode);
    const url = parseCallbackUrl(input.delivery.url);
    await this.repository.deactivate(
      deriveSubscriptionId({ principal: input.principal, url: url.href, name, arguments: args }),
      "unsubscribed",
    );
    return {};
  }

  private async requireCapacity(principal: string, hostname: string, id: string, now: Date) {
    const full = (message: string) => invalidParams(message, "subscription_limit");
    if (await this.repository.countLive(now) >= this.limits.total) {
      throw full("The server has reached its limit of active subscriptions.");
    }
    if (await this.repository.countLiveForPrincipal(principal, id, now) >= this.limits.perPrincipal) {
      throw full("Too many active subscriptions for this account.");
    }
    if (await this.repository.countLiveForHost(hostname, id, now) >= this.limits.perHost) {
      throw full(`Too many active subscriptions for ${hostname}.`);
    }
    const domain = registrableDomain(hostname);
    if (await this.repository.countLiveForDomain(domain, id, now) >= this.limits.perDomain) {
      throw full(`Too many active subscriptions for ${domain}.`);
    }
  }

  private async verifiedAt(input: {
    principal: string;
    url: string;
    id: string;
    secret: string;
    now: Date;
    cached: boolean;
  }) {
    const cached = input.cached
      ? await this.repository.findVerifiedAt({
        principal: input.principal,
        url: input.url,
        secret: input.secret,
        since: new Date(input.now.getTime() - verificationCacheMs),
      })
      : null;
    if (cached) return cached;
    await this.verifier.verify({ url: input.url, subscriptionId: input.id, secret: input.secret });
    return input.now.toISOString();
  }

  private merge(input: {
    principal: string;
    existing: EventSubscription | null;
    wasLive: boolean;
    id: string;
    name: McpEventName;
    args: ArticlePublishedArguments;
    url: URL;
    secret: string;
    expiresAt: string;
    verifiedAt: string;
    now: Date;
  }): EventSubscription {
    const { existing, now } = input;
    const rotated = existing !== null && existing.secret !== input.secret;
    const stillRotating = existing?.previousSecretExpiresAt
      && Date.parse(existing.previousSecretExpiresAt) > now.getTime();
    return {
      id: input.id,
      principal: input.principal,
      eventName: input.name,
      arguments: input.args,
      url: input.url.href,
      host: input.url.hostname,
      secret: input.secret,
      previousSecret: rotated
        ? existing.secret
        : stillRotating ? existing.previousSecret : null,
      previousSecretExpiresAt: rotated
        ? new Date(now.getTime() + secretRotationWindowMs).toISOString()
        : stillRotating ? existing.previousSecretExpiresAt : null,
      status: "active",
      expiresAt: input.expiresAt,
      verifiedAt: input.verifiedAt,
      // No replay: a lapsed or new subscription starts from now and never backfills.
      checkpoint: input.wasLive && existing ? existing.checkpoint : now.toISOString(),
      createdAt: existing?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }
}
