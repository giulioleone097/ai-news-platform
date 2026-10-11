import type { McpEventsRepository } from "@atlasnews/core/mcp-events/domain/ports";
import type {
  ClaimedDelivery,
  EventSubscription,
  NewDelivery,
  SubscriptionStatus,
} from "@atlasnews/core/mcp-events/domain/subscription";

import type { D1Database, D1PreparedStatement } from "../sites/cloudflare";
import { McpEventsPersistenceError, mapClaimedDelivery, mapSubscription } from "./supabase-repository";

type Row = Record<string, unknown>;

const liveSubscription = "status = 'active' AND expires_at > ?";

function fail(): never {
  // Details stay out of responses and logs: rows can hold callback secrets.
  throw new McpEventsPersistenceError();
}

/** Stored instants are normalized ISO-8601 text, which sorts chronologically. */
function instant(value: string | Date): string {
  const time = typeof value === "string" ? Date.parse(value) : value.getTime();
  if (Number.isNaN(time)) fail();
  return new Date(time).toISOString();
}

const optionalInstant = (value: string | null) => (value === null ? null : instant(value));

function toSubscription(row: Row) {
  return mapSubscription({ ...row, arguments: JSON.parse(String(row.arguments)) });
}

function toClaimedDelivery(row: Row) {
  return mapClaimedDelivery({ ...row, event: JSON.parse(String(row.event)) });
}

/**
 * MCP Events on D1. Like the service-role Supabase adapter it trusts its callers: the tables hold callback
 * secrets and are reachable only from the Worker. The claim replaces `FOR UPDATE SKIP LOCKED` with one
 * leasing UPDATE; SQLite runs one write at a time, so two claims never take the same delivery.
 */
export class D1McpEventsRepository implements McpEventsRepository {
  constructor(private readonly database: D1Database) {}

  private async run(statements: D1PreparedStatement[]) {
    try {
      return await this.database.batch<Row>(statements);
    } catch {
      return fail();
    }
  }

  private async rows(sql: string, ...values: unknown[]) {
    const [result] = await this.run([this.database.prepare(sql).bind(...values)]);
    return result.results;
  }

  private async count(where: string, ...values: unknown[]) {
    const [row] = await this.rows(`SELECT COUNT(*) AS total FROM mcp_event_subscriptions WHERE ${where}`, ...values);
    return typeof row?.total === "number" ? row.total : fail();
  }

  async find(id: string) {
    const [row] = await this.rows("SELECT * FROM mcp_event_subscriptions WHERE id = ?", id);
    return row ? toSubscription(row) : null;
  }

  async save(subscription: EventSubscription) {
    await this.rows(
      `INSERT INTO mcp_event_subscriptions
         (id, principal, event_name, arguments, callback_url, callback_host, secret, previous_secret,
          previous_secret_expires_at, status, expires_at, verified_at, checkpoint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         principal = excluded.principal, event_name = excluded.event_name, arguments = excluded.arguments,
         callback_url = excluded.callback_url, callback_host = excluded.callback_host, secret = excluded.secret,
         previous_secret = excluded.previous_secret,
         previous_secret_expires_at = excluded.previous_secret_expires_at, status = excluded.status,
         expires_at = excluded.expires_at, verified_at = excluded.verified_at, checkpoint = excluded.checkpoint,
         created_at = excluded.created_at, updated_at = excluded.updated_at`,
      subscription.id,
      subscription.principal,
      subscription.eventName,
      JSON.stringify(subscription.arguments),
      subscription.url,
      subscription.host,
      subscription.secret,
      subscription.previousSecret,
      optionalInstant(subscription.previousSecretExpiresAt),
      subscription.status,
      instant(subscription.expiresAt),
      instant(subscription.verifiedAt),
      instant(subscription.checkpoint),
      instant(subscription.createdAt),
      instant(subscription.updatedAt),
    );
  }

  async deactivate(id: string, status: Exclude<SubscriptionStatus, "active">) {
    await this.rows(
      "UPDATE mcp_event_subscriptions SET status = ?, updated_at = ? WHERE id = ? AND status = 'active'",
      status,
      new Date().toISOString(),
      id,
    );
  }

  countLiveForHost(host: string, excludingId: string, now: Date) {
    return this.count(`callback_host = ? AND ${liveSubscription} AND id <> ?`, host, instant(now), excludingId);
  }

  countLiveForDomain(domain: string, excludingId: string, now: Date) {
    // Exact suffix match: a LIKE pattern would treat "_" in a hostname as a wildcard.
    return this.count(
      `(callback_host = ?1 OR substr(callback_host, -(length(?1) + 1)) = '.' || ?1)
         AND status = 'active' AND expires_at > ?2 AND id <> ?3`,
      domain,
      instant(now),
      excludingId,
    );
  }

  countLive(now: Date) {
    return this.count(liveSubscription, instant(now));
  }

  async findVerifiedAt(input: { principal: string; url: string; secret: string; since: Date }) {
    const [row] = await this.rows(
      `SELECT verified_at FROM mcp_event_subscriptions
       WHERE principal = ? AND callback_url = ? AND secret = ? AND verified_at >= ?
       ORDER BY verified_at DESC LIMIT 1`,
      input.principal,
      input.url,
      input.secret,
      instant(input.since),
    );
    return row ? instant(String(row.verified_at)) : null;
  }

  async listLive(now: Date, limit: number) {
    const rows = await this.rows(
      `SELECT * FROM mcp_event_subscriptions WHERE ${liveSubscription} ORDER BY checkpoint, id LIMIT ?`,
      instant(now),
      limit,
    );
    return rows.map(toSubscription);
  }

  async getMany(ids: string[]) {
    if (!ids.length) return [];
    // D1 caps a statement at 100 parameters; callers pass at most one claim's worth of ids.
    const rows = await this.rows(
      `SELECT * FROM mcp_event_subscriptions WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ...ids,
    );
    return rows.map(toSubscription);
  }

  async advanceCheckpoint(id: string, checkpoint: string) {
    await this.rows(
      "UPDATE mcp_event_subscriptions SET checkpoint = ?1, updated_at = ?3 WHERE id = ?2 AND checkpoint < ?1",
      instant(checkpoint),
      id,
      new Date().toISOString(),
    );
  }

  async enqueue(deliveries: NewDelivery[], maxAttempts: number, now: Date) {
    if (!deliveries.length) return 0;
    const stamp = instant(now);
    // One batch, so the whole set is queued or none of it; duplicates per (subscription, article) are skipped.
    const results = await this.run(deliveries.map((delivery) => this.database.prepare(
      `INSERT INTO mcp_event_deliveries
         (id, subscription_id, article_id, event_id, event, max_attempts, available_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (subscription_id, article_id) DO NOTHING`,
    ).bind(
      crypto.randomUUID(),
      delivery.subscriptionId,
      delivery.articleId,
      delivery.eventId,
      JSON.stringify(delivery.event),
      maxAttempts,
      stamp,
      stamp,
      stamp,
    )));
    return results.reduce((queued, result) => queued + result.meta.changes, 0);
  }

  async claim(input: { workerToken: string; limit: number; leaseSeconds: number; now: Date }) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50
      || !Number.isInteger(input.leaseSeconds) || input.leaseSeconds < 30 || input.leaseSeconds > 300) {
      fail();
    }
    const now = instant(input.now);
    const leaseExpiresAt = new Date(input.now.getTime() + input.leaseSeconds * 1000).toISOString();
    const [, claimed] = await this.run([
      this.database.prepare(
        `UPDATE mcp_event_deliveries SET
           status = 'failed', lease_token = NULL, lease_expires_at = NULL,
           last_error_code = 'lease_expired_max_attempts', updated_at = ?1
         WHERE status = 'processing' AND lease_expires_at <= ?1 AND attempts >= max_attempts`,
      ).bind(now),
      this.database.prepare(
        `UPDATE mcp_event_deliveries SET
           status = 'processing', attempts = attempts + 1, lease_token = ?2, lease_expires_at = ?3, updated_at = ?1
         WHERE id IN (
           SELECT delivery.id FROM mcp_event_deliveries delivery
           JOIN mcp_event_subscriptions subscription ON subscription.id = delivery.subscription_id
           WHERE subscription.status = 'active' AND subscription.expires_at > ?1
             AND delivery.attempts < delivery.max_attempts
             AND ((delivery.status = 'pending' AND delivery.available_at <= ?1)
               OR (delivery.status = 'processing' AND delivery.lease_expires_at <= ?1))
           ORDER BY delivery.available_at, delivery.created_at, delivery.id
           LIMIT ?4
         ) RETURNING *`,
      ).bind(now, input.workerToken, leaseExpiresAt, input.limit),
    ]);
    return claimed.results
      .sort((left, right) => String(left.available_at).localeCompare(String(right.available_at))
        || String(left.created_at).localeCompare(String(right.created_at))
        || String(left.id).localeCompare(String(right.id)))
      .map((row): ClaimedDelivery => toClaimedDelivery(row));
  }

  /** Settles a delivery only for the worker that still holds its lease. */
  private async settle(id: string, workerToken: string, now: string, assignments: string, ...values: unknown[]) {
    await this.rows(
      `UPDATE mcp_event_deliveries SET ${assignments}, lease_token = NULL, lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'processing' AND lease_token = ?`,
      ...values,
      now,
      id,
      workerToken,
    );
  }

  markDelivered(id: string, workerToken: string, now: Date) {
    const stamp = instant(now);
    return this.settle(id, workerToken, stamp, "status = 'delivered', delivered_at = ?, last_error_code = NULL", stamp);
  }

  markRetry(input: { id: string; workerToken: string; availableAt: string; errorCode: string }) {
    return this.settle(
      input.id,
      input.workerToken,
      new Date().toISOString(),
      "status = 'pending', available_at = ?, last_error_code = ?",
      instant(input.availableAt),
      input.errorCode,
    );
  }

  markFailed(input: { id: string; workerToken: string; errorCode: string; now: Date }) {
    return this.settle(
      input.id,
      input.workerToken,
      instant(input.now),
      "status = 'failed', last_error_code = ?",
      input.errorCode,
    );
  }

  markCancelled(id: string, workerToken: string, now: Date) {
    return this.settle(id, workerToken, instant(now), "status = 'cancelled'");
  }

  async prune(before: Date) {
    const cutoff = instant(before);
    // Deleting a subscription cascades to its deliveries.
    await this.run([
      this.database.prepare(
        "DELETE FROM mcp_event_subscriptions WHERE (status <> 'active' OR expires_at <= ?1) AND updated_at <= ?1",
      ).bind(cutoff),
      this.database.prepare(
        "DELETE FROM mcp_event_deliveries WHERE status IN ('delivered', 'failed', 'cancelled') AND updated_at <= ?",
      ).bind(cutoff),
    ]);
  }
}
