import type { SupabaseClient } from "@supabase/supabase-js";

import { articlePublishedArgumentsSchema, isMcpEventName } from "@atlasnews/core/mcp-events/domain/events";
import type { McpEventsRepository } from "@atlasnews/core/mcp-events/domain/ports";
import type {
  ClaimedDelivery,
  EventSubscription,
  NewDelivery,
  SubscriptionStatus,
} from "@atlasnews/core/mcp-events/domain/subscription";

const subscriptions = "mcp_event_subscriptions";
const deliveries = "mcp_event_deliveries";

export class McpEventsPersistenceError extends Error {
  constructor() {
    super("MCP events persistence failed.");
    this.name = "McpEventsPersistenceError";
  }
}

function fail(error: unknown): never {
  void error; // Details stay out of responses and logs: rows can hold callback secrets.
  throw new McpEventsPersistenceError();
}

function ensure(error: unknown) {
  if (error) fail(error);
}

type Row = Record<string, unknown>;

function text(row: Row, key: string) {
  const value = row[key];
  if (typeof value !== "string") fail(key);
  return value;
}

function nullableText(row: Row, key: string) {
  return row[key] === null ? null : text(row, key);
}

function instant(row: Row, key: string) {
  return new Date(text(row, key)).toISOString();
}

export function mapSubscription(row: Row): EventSubscription {
  const eventName = text(row, "event_name");
  const parsedArguments = articlePublishedArgumentsSchema.safeParse(row.arguments);
  const status = text(row, "status");
  if (!isMcpEventName(eventName) || !parsedArguments.success
    || !["active", "unsubscribed", "gone"].includes(status)) {
    fail(row.id);
  }
  return {
    id: text(row, "id"),
    principal: text(row, "principal"),
    eventName: eventName as EventSubscription["eventName"],
    arguments: parsedArguments.data as EventSubscription["arguments"],
    url: text(row, "callback_url"),
    host: text(row, "callback_host"),
    secret: text(row, "secret"),
    previousSecret: nullableText(row, "previous_secret"),
    previousSecretExpiresAt: row.previous_secret_expires_at === null
      ? null
      : instant(row, "previous_secret_expires_at"),
    status: status as SubscriptionStatus,
    expiresAt: instant(row, "expires_at"),
    verifiedAt: instant(row, "verified_at"),
    checkpoint: instant(row, "checkpoint"),
    createdAt: instant(row, "created_at"),
    updatedAt: instant(row, "updated_at"),
  };
}

export function mapClaimedDelivery(row: Row): ClaimedDelivery {
  if (typeof row.attempts !== "number" || typeof row.max_attempts !== "number"
    || !row.event || typeof row.event !== "object") {
    fail(row.id);
  }
  return {
    id: text(row, "id"),
    subscriptionId: text(row, "subscription_id"),
    eventId: text(row, "event_id"),
    event: row.event as ClaimedDelivery["event"],
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
  };
}

function toRow(subscription: EventSubscription) {
  return {
    id: subscription.id,
    principal: subscription.principal,
    event_name: subscription.eventName,
    arguments: subscription.arguments,
    callback_url: subscription.url,
    callback_host: subscription.host,
    secret: subscription.secret,
    previous_secret: subscription.previousSecret,
    previous_secret_expires_at: subscription.previousSecretExpiresAt,
    status: subscription.status,
    expires_at: subscription.expiresAt,
    verified_at: subscription.verifiedAt,
    checkpoint: subscription.checkpoint,
    created_at: subscription.createdAt,
  };
}

/** Service-role Supabase adapter; tables are reachable only through the service key. */
export class SupabaseMcpEventsRepository implements McpEventsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async find(id: string) {
    const { data, error } = await this.client.from(subscriptions).select("*").eq("id", id).maybeSingle();
    ensure(error);
    return data ? mapSubscription(data) : null;
  }

  async save(subscription: EventSubscription) {
    const { error } = await this.client.from(subscriptions).upsert(toRow(subscription), { onConflict: "id" });
    ensure(error);
  }

  async deactivate(id: string, status: Exclude<SubscriptionStatus, "active">) {
    const { error } = await this.client.from(subscriptions).update({ status }).eq("id", id).eq("status", "active");
    ensure(error);
  }

  async countLiveForHost(host: string, excludingId: string, now: Date) {
    const { count, error } = await this.client
      .from(subscriptions)
      .select("id", { count: "exact", head: true })
      .eq("callback_host", host)
      .eq("status", "active")
      .gt("expires_at", now.toISOString())
      .neq("id", excludingId);
    ensure(error);
    return count ?? 0;
  }

  async countLiveForDomain(domain: string, excludingId: string, now: Date) {
    // Hostnames are validated URL hostnames (letters, digits, dots, hyphens), safe inside a filter.
    const { count, error } = await this.client
      .from(subscriptions)
      .select("id", { count: "exact", head: true })
      .or(`callback_host.eq.${domain},callback_host.like.*.${domain}`)
      .eq("status", "active")
      .gt("expires_at", now.toISOString())
      .neq("id", excludingId);
    ensure(error);
    return count ?? 0;
  }

  async countLive(now: Date) {
    const { count, error } = await this.client
      .from(subscriptions)
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", now.toISOString());
    ensure(error);
    return count ?? 0;
  }

  async findVerifiedAt(input: { principal: string; url: string; secret: string; since: Date }) {
    const { data, error } = await this.client
      .from(subscriptions)
      .select("verified_at")
      .eq("principal", input.principal)
      .eq("callback_url", input.url)
      .eq("secret", input.secret)
      .gte("verified_at", input.since.toISOString())
      .order("verified_at", { ascending: false })
      .limit(1);
    ensure(error);
    return data?.[0] ? instant(data[0], "verified_at") : null;
  }

  async listLive(now: Date, limit: number) {
    const { data, error } = await this.client
      .from(subscriptions)
      .select("*")
      .eq("status", "active")
      .gt("expires_at", now.toISOString())
      .order("checkpoint", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    ensure(error);
    return (data ?? []).map(mapSubscription);
  }

  async getMany(ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await this.client.from(subscriptions).select("*").in("id", ids);
    ensure(error);
    return (data ?? []).map(mapSubscription);
  }

  async advanceCheckpoint(id: string, checkpoint: string) {
    const { error } = await this.client.from(subscriptions).update({ checkpoint }).eq("id", id).lt("checkpoint", checkpoint);
    ensure(error);
  }

  async enqueue(items: NewDelivery[], maxAttempts: number, now: Date) {
    const { data, error } = await this.client
      .from(deliveries)
      .upsert(
        items.map((item) => ({
          subscription_id: item.subscriptionId,
          article_id: item.articleId,
          event_id: item.eventId,
          event: item.event,
          max_attempts: maxAttempts,
          available_at: now.toISOString(),
        })),
        { onConflict: "subscription_id,article_id", ignoreDuplicates: true },
      )
      .select("id");
    ensure(error);
    return data?.length ?? 0;
  }

  async claim(input: { workerToken: string; limit: number; leaseSeconds: number }) {
    const { data, error } = await this.client.rpc("claim_mcp_event_deliveries", {
      p_worker_token: input.workerToken,
      p_limit: input.limit,
      p_lease_seconds: input.leaseSeconds,
    });
    ensure(error);
    if (!Array.isArray(data)) fail("claim");
    return data.map(mapClaimedDelivery);
  }

  private async settle(id: string, workerToken: string, patch: Row) {
    const { error } = await this.client
      .from(deliveries)
      .update({ ...patch, lease_token: null, lease_expires_at: null })
      .eq("id", id)
      .eq("status", "processing")
      .eq("lease_token", workerToken);
    ensure(error);
  }

  markDelivered(id: string, workerToken: string, now: Date) {
    return this.settle(id, workerToken, {
      status: "delivered",
      delivered_at: now.toISOString(),
      last_error_code: null,
    });
  }

  markRetry(input: { id: string; workerToken: string; availableAt: string; errorCode: string }) {
    return this.settle(input.id, input.workerToken, {
      status: "pending",
      available_at: input.availableAt,
      last_error_code: input.errorCode,
    });
  }

  markFailed(input: { id: string; workerToken: string; errorCode: string }) {
    return this.settle(input.id, input.workerToken, { status: "failed", last_error_code: input.errorCode });
  }

  markCancelled(id: string, workerToken: string) {
    return this.settle(id, workerToken, { status: "cancelled" });
  }

  async prune(before: Date) {
    const cutoff = before.toISOString();
    const endedSubscriptions = await this.client
      .from(subscriptions)
      .delete()
      .or(`status.neq.active,expires_at.lte.${cutoff}`)
      .lte("updated_at", cutoff);
    ensure(endedSubscriptions.error);
    const finishedDeliveries = await this.client
      .from(deliveries)
      .delete()
      .in("status", ["delivered", "failed", "cancelled"])
      .lte("updated_at", cutoff);
    ensure(finishedDeliveries.error);
  }
}
