import { SocialPublishingError } from "@atlasnews/core/social-publishing/domain/errors";
import type { SocialOutboxRepository } from "@atlasnews/core/social-publishing/domain/ports";
import {
  socialProviders,
  whatsappProviderStatuses,
  type SocialOutboxJob,
  type SocialOutboxQuery,
  type SocialProvider,
  type SocialProviderResult,
  type SocialPublishPayload,
} from "@atlasnews/core/social-publishing/domain/social-publication";

import type { D1Database, D1PreparedStatement } from "../sites/cloudflare";
import { mapSocialOutboxJob } from "./supabase-social-outbox-repository";

type Row = Record<string, unknown>;
type Input<Method extends keyof SocialOutboxRepository> = Parameters<SocialOutboxRepository[Method]>[0];

const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9:._/-]{15,159}$/;
const whatsappRecipientPattern = /^[1-9][0-9]{6,14}$/;
const maximumPayloadBytes = 16_384;

function persistenceError(): SocialPublishingError {
  return new SocialPublishingError("Social outbox persistence failed.", "persistence_error");
}

function invalid(): never {
  throw persistenceError();
}

function instant(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) invalid();
  return new Date(time).toISOString();
}

/** Key-order independent comparison, as Postgres compares jsonb values. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function toJob(row: Row): SocialOutboxJob {
  return mapSocialOutboxJob({
    ...row,
    payload: JSON.parse(String(row.payload)),
    retry_safe: row.retry_safe === 1,
  });
}

/** The checks that `enqueue_social_outbox` and `requeue_social_outbox` make on a payload. */
function assertPayload(provider: SocialProvider, payload: SocialPublishPayload) {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (text.length < 1 || text.length > 4_096) invalid();
  if (payload.articleUrl && !payload.articleUrl.startsWith("https://")) invalid();
  if (provider === "whatsapp") {
    if (!whatsappRecipientPattern.test(payload.recipient ?? "")) invalid();
  } else if ("recipient" in payload) {
    invalid();
  }
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).byteLength > maximumPayloadBytes) invalid();
  return json;
}

function assertJobBounds(provider: SocialProvider, maxAttempts: number) {
  if (!socialProviders.includes(provider) || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    invalid();
  }
}

const clip = (value: string, length: number) => value.trim().slice(0, length);

const providerStatusRank = (column: string) =>
  `CASE ${column} WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END`;

/**
 * Social outbox on D1. Each Postgres function becomes one `database.batch`: the conditional UPDATE of the
 * job plus, in the same transaction, the matching state change of its distribution publication. The
 * publication statement is guarded by `changes()`, so it applies only when the job statement matched a row.
 * Authorization stays in the delivery layer, as with the service-role Supabase client.
 */
export class D1SocialOutboxRepository implements SocialOutboxRepository {
  constructor(private readonly database: D1Database) {}

  /** Runs the statements as one atomic batch and returns each statement's rows. */
  private async run(statements: D1PreparedStatement[]): Promise<Row[][]> {
    try {
      return (await this.database.batch<Row>(statements)).map((result) => result.results);
    } catch {
      throw persistenceError();
    }
  }

  private statement(sql: string, ...values: unknown[]) {
    return this.database.prepare(sql).bind(...values);
  }

  /** Moves the publication along with the job; applies only if the preceding statement changed a row. */
  private publicationFollows(
    outbox: { where: string; values: unknown[] },
    assignments: string,
    values: unknown[],
    now: string,
  ) {
    return this.statement(
      `UPDATE social_publications SET ${assignments}, updated_at = ?
       WHERE changes() > 0 AND id = (SELECT publication_id FROM social_outbox WHERE ${outbox.where})`,
      ...values,
      now,
      ...outbox.values,
    );
  }

  /** Applies a conditional job update; no matching row means the lease or state no longer holds. */
  private async transition(update: D1PreparedStatement, ...followers: D1PreparedStatement[]) {
    const [rows] = await this.run([update, ...followers]);
    if (!rows[0]) throw persistenceError();
    return toJob(rows[0]);
  }

  private async findOne(sql: string, ...values: unknown[]) {
    const [rows] = await this.run([this.statement(sql, ...values)]);
    return rows[0] ? toJob(rows[0]) : null;
  }

  async enqueue(input: Input<"enqueue">) {
    assertJobBounds(input.provider, input.maxAttempts);
    if (!idempotencyKeyPattern.test(input.idempotencyKey)) invalid();
    const payload = assertPayload(input.provider, input.payload);
    const now = new Date().toISOString();

    // The channel check is part of the INSERT ... SELECT, so a missing or mismatched publication inserts nothing.
    const [inserted] = await this.run([this.statement(
      `INSERT INTO social_outbox
         (id, publication_id, provider, idempotency_key, payload, available_at, max_attempts, created_at, updated_at)
       SELECT ?, id, ?, ?, ?, ?, ?, ?, ? FROM social_publications WHERE id = ? AND channel = ?
       ON CONFLICT DO NOTHING RETURNING *`,
      crypto.randomUUID(),
      input.provider,
      input.idempotencyKey,
      payload,
      input.scheduledFor ? instant(input.scheduledFor) : now,
      input.maxAttempts,
      now,
      now,
      input.publicationId,
      input.provider,
    )]);
    if (inserted[0]) return toJob(inserted[0]);

    // Same key (or same publication) again: an identical request replays, a different one is a reuse mismatch.
    const existing = await this.findOne(
      `SELECT * FROM social_outbox WHERE publication_id = ? OR idempotency_key = ?
       ORDER BY (idempotency_key = ?) DESC LIMIT 1`,
      input.publicationId,
      input.idempotencyKey,
      input.idempotencyKey,
    );
    if (!existing
      || existing.publicationId !== input.publicationId
      || existing.provider !== input.provider
      || existing.idempotencyKey !== input.idempotencyKey
      || canonical(existing.payload) !== canonical(input.payload)) {
      throw persistenceError();
    }
    return existing;
  }

  async requeue(input: Input<"requeue">) {
    assertJobBounds(input.provider, input.maxAttempts);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) invalid();
    const payload = assertPayload(input.provider, input.payload);
    const now = new Date().toISOString();

    const [updated] = await this.run([
      this.statement(
        `UPDATE social_outbox SET
           payload = ?, status = 'pending', attempts = 0, max_attempts = ?, available_at = ?,
           lease_token = NULL, lease_expires_at = NULL, dispatch_started_at = NULL,
           provider_message_id = NULL, provider_url = NULL, provider_status = NULL, provider_status_at = NULL,
           revision = revision + 1, requeue_source_revision = ?, retry_safe = 1,
           last_error_code = NULL, last_error_message = NULL,
           sent_at = NULL, failed_at = NULL, delivered_at = NULL, read_at = NULL, updated_at = ?
         WHERE id = ? AND publication_id = ? AND provider = ? AND revision = ?
           AND (status = 'cancelled' OR (status = 'failed' AND retry_safe = 1))
         RETURNING *`,
        payload,
        input.maxAttempts,
        input.scheduledFor ? instant(input.scheduledFor) : now,
        input.expectedRevision,
        now,
        input.id,
        input.publicationId,
        input.provider,
        input.expectedRevision,
      ),
      this.publicationFollows(
        { where: "id = ?", values: [input.id] },
        "status = 'ready', external_url = NULL, published_at = NULL",
        [],
        now,
      ),
    ]);
    if (updated[0]) return toJob(updated[0]);

    // Nothing matched: accept only a replay of the very same requeue.
    const [current] = await this.run([this.statement("SELECT * FROM social_outbox WHERE id = ?", input.id)]);
    const job = current[0] ? toJob(current[0]) : null;
    if (!job
      || job.publicationId !== input.publicationId
      || job.provider !== input.provider
      || job.status === "cancelled"
      || current[0].requeue_source_revision !== input.expectedRevision
      || canonical(job.payload) !== canonical(input.payload)
      || job.maxAttempts !== input.maxAttempts) {
      throw persistenceError();
    }
    if (job.status === "pending" || job.status === "processing") {
      await this.run([this.statement(
        `UPDATE social_publications SET status = 'ready', external_url = NULL, published_at = NULL, updated_at = ?
         WHERE id = ?`,
        now,
        job.publicationId,
      )]);
    }
    return job;
  }

  async updatePending(input: Input<"updatePending">) {
    assertJobBounds(input.provider, input.maxAttempts);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) invalid();
    const payload = assertPayload(input.provider, input.payload);
    const now = new Date().toISOString();
    // The WHERE clause is the whole rule: a job that was claimed, cancelled or edited since it was read matches no row.
    return this.transition(this.statement(
      `UPDATE social_outbox SET payload = ?, max_attempts = ?, available_at = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND provider = ? AND revision = ? AND status = 'pending' AND dispatch_started_at IS NULL
       RETURNING *`,
      payload,
      input.maxAttempts,
      instant(input.availableAt),
      now,
      input.id,
      input.provider,
      input.expectedRevision,
    ));
  }

  getById(id: string) {
    return this.findOne("SELECT * FROM social_outbox WHERE id = ?", id);
  }

  getByIdempotencyKey(idempotencyKey: string) {
    return this.findOne("SELECT * FROM social_outbox WHERE idempotency_key = ?", idempotencyKey);
  }

  async list(query: Required<Pick<SocialOutboxQuery, "limit" | "offset">> & SocialOutboxQuery) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.provider) {
      conditions.push("provider = ?");
      values.push(query.provider);
    }
    if (query.status) {
      conditions.push("status = ?");
      values.push(query.status);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const [rows, counts] = await this.run([
      this.statement(
        `SELECT * FROM social_outbox${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        ...values,
        query.limit,
        query.offset,
      ),
      this.statement(`SELECT COUNT(*) AS total FROM social_outbox${where}`, ...values),
    ]);
    const total = counts[0]?.total;
    if (typeof total !== "number") throw persistenceError();
    const items = rows.map(toJob);
    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + items.length < total,
    };
  }

  cancelPending(id: string) {
    const now = new Date().toISOString();
    return this.transition(
      this.statement(
        `UPDATE social_outbox SET status = 'cancelled', revision = revision + 1, retry_safe = 0, updated_at = ?
         WHERE id = ? AND status = 'pending' AND dispatch_started_at IS NULL RETURNING *`,
        now,
        id,
      ),
      this.publicationFollows({ where: "id = ?", values: [id] }, "status = 'draft'", [], now),
    );
  }

  /**
   * One UPDATE cancels every job, and only when the count of jobs that can still be cancelled (taken before the
   * update runs) is all of them: a job that was claimed since the service checked cancels none.
   */
  async cancelPendingMany(ids: string[]) {
    const now = new Date().toISOString();
    const idList = ids.map(() => "?").join(", ");
    const [cancelled] = await this.run([
      this.statement(
        `UPDATE social_outbox SET status = 'cancelled', revision = revision + 1, retry_safe = 0, updated_at = ?
         WHERE id IN (${idList}) AND status = 'pending' AND dispatch_started_at IS NULL
           AND (SELECT count(*) FROM social_outbox
                WHERE id IN (${idList}) AND status = 'pending' AND dispatch_started_at IS NULL) = ?
         RETURNING *`,
        now,
        ...ids,
        ...ids,
        ids.length,
      ),
      this.statement(
        `UPDATE social_publications SET status = 'draft', updated_at = ?
         WHERE changes() > 0 AND id IN (SELECT publication_id FROM social_outbox WHERE id IN (${idList}))`,
        now,
        ...ids,
      ),
    ]);
    const jobs = new Map(cancelled.map(toJob).map((job) => [job.id, job]));
    if (jobs.size !== ids.length) throw persistenceError();
    return ids.map((id) => {
      const job = jobs.get(id);
      if (!job) throw persistenceError();
      return job;
    });
  }

  retryFailed(id: string) {
    const now = new Date().toISOString();
    return this.transition(
      this.statement(
        `UPDATE social_outbox SET
           status = 'pending', revision = revision + 1, attempts = 0, available_at = ?,
           dispatch_started_at = NULL, retry_safe = 1, last_error_code = NULL, last_error_message = NULL,
           failed_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'failed' AND retry_safe = 1 RETURNING *`,
        now,
        now,
        id,
      ),
      this.publicationFollows({ where: "id = ?", values: [id] }, "status = 'ready'", [], now),
    );
  }

  async claim(input: Input<"claim">) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 25
      || !Number.isInteger(input.leaseSeconds) || input.leaseSeconds < 30 || input.leaseSeconds > 300) {
      invalid();
    }
    const now = new Date();
    const stamp = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1000).toISOString();

    const results = await this.run([
      // A lease that lapsed after the provider call began has an unknown outcome: never re-send it.
      this.statement(
        `UPDATE social_outbox SET
           status = 'failed', revision = revision + 1, lease_token = NULL, lease_expires_at = NULL, retry_safe = 0,
           last_error_code = 'lease_expired_after_dispatch',
           last_error_message = 'Dispatch outcome requires manual reconciliation.',
           failed_at = COALESCE(failed_at, ?), updated_at = ?
         WHERE status = 'processing' AND lease_expires_at <= ? AND dispatch_started_at IS NOT NULL`,
        stamp,
        stamp,
        stamp,
      ),
      this.statement(
        `UPDATE social_outbox SET
           status = 'failed', revision = revision + 1, lease_token = NULL, lease_expires_at = NULL, retry_safe = 1,
           last_error_code = 'max_attempts_before_dispatch',
           last_error_message = 'Maximum attempts reached before provider dispatch.',
           failed_at = COALESCE(failed_at, ?), updated_at = ?
         WHERE status = 'processing' AND lease_expires_at <= ? AND dispatch_started_at IS NULL
           AND attempts >= max_attempts`,
        stamp,
        stamp,
        stamp,
      ),
      this.statement(
        `UPDATE social_publications SET status = 'failed', updated_at = ?
         WHERE status <> 'failed' AND EXISTS (
           SELECT 1 FROM social_outbox
           WHERE social_outbox.publication_id = social_publications.id AND social_outbox.status = 'failed'
             AND social_outbox.last_error_code IN ('lease_expired_after_dispatch', 'max_attempts_before_dispatch')
         )`,
        stamp,
      ),
      // One statement picks and leases the rows; SQLite runs one write at a time, so two claims never overlap.
      this.statement(
        `UPDATE social_outbox SET
           status = 'processing', revision = revision + 1, attempts = attempts + 1,
           lease_token = ?, lease_expires_at = ?, dispatch_started_at = NULL, retry_safe = 1,
           last_error_code = NULL, last_error_message = NULL, failed_at = NULL, updated_at = ?
         WHERE id IN (
           SELECT id FROM social_outbox
           WHERE (status = 'pending' AND available_at <= ? AND attempts < max_attempts)
              OR (status = 'processing' AND lease_expires_at <= ? AND dispatch_started_at IS NULL
                  AND attempts < max_attempts)
           ORDER BY available_at, created_at, id LIMIT ?
         ) RETURNING *`,
        input.workerToken,
        leaseExpiresAt,
        stamp,
        stamp,
        stamp,
        input.limit,
      ),
    ]);
    return results[3]
      .map(toJob)
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt)
        || left.createdAt.localeCompare(right.createdAt)
        || left.id.localeCompare(right.id));
  }

  markDispatchStarted(id: string, workerToken: string) {
    const now = new Date().toISOString();
    return this.transition(this.statement(
      `UPDATE social_outbox SET dispatch_started_at = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND status = 'processing' AND lease_token = ? AND lease_expires_at > ?
         AND dispatch_started_at IS NULL RETURNING *`,
      now,
      now,
      id,
      workerToken,
      now,
    ));
  }

  async markSent(id: string, workerToken: string, result: SocialProviderResult) {
    const messageId = result.messageId.trim();
    const status = result.status.trim();
    if (messageId.length < 1 || messageId.length > 512
      || (result.url ?? "").length > 2_048
      || status.length < 1 || status.length > 80) {
      invalid();
    }
    const now = new Date().toISOString();
    return this.transition(
      this.statement(
        `UPDATE social_outbox SET
           status = 'sent', revision = revision + 1, lease_token = NULL, lease_expires_at = NULL,
           provider_message_id = ?, provider_url = ?, provider_status = ?, retry_safe = 0,
           sent_at = COALESCE(sent_at, ?), failed_at = NULL, last_error_code = NULL, last_error_message = NULL,
           updated_at = ?
         WHERE id = ? AND status = 'processing' AND lease_token = ? AND lease_expires_at > ?
           AND dispatch_started_at IS NOT NULL RETURNING *`,
        messageId,
        (result.url ?? "").trim() || null,
        status,
        now,
        now,
        id,
        workerToken,
        now,
      ),
      this.statement(
        `UPDATE social_publications SET
           status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?,
           external_url = (SELECT provider_url FROM social_outbox WHERE id = ?)
         WHERE changes() > 0 AND id = (SELECT publication_id FROM social_outbox WHERE id = ?)`,
        now,
        now,
        id,
        id,
      ),
    );
  }

  async markRetry(input: Input<"markRetry">) {
    const now = new Date().toISOString();
    return this.transition(
      this.statement(
        `UPDATE social_outbox SET
           status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
           revision = revision + 1, available_at = ?, lease_token = NULL, lease_expires_at = NULL,
           dispatch_started_at = NULL, retry_safe = 1, last_error_code = ?, last_error_message = ?,
           failed_at = CASE WHEN attempts >= max_attempts THEN ? ELSE NULL END, updated_at = ?
         WHERE id = ? AND status = 'processing' AND lease_token = ? RETURNING *`,
        instant(input.availableAt),
        clip(input.errorCode, 80),
        clip(input.errorMessage, 400),
        now,
        now,
        input.id,
        input.workerToken,
      ),
      this.statement(
        `UPDATE social_publications SET status = 'failed', updated_at = ?
         WHERE changes() > 0
           AND id = (SELECT publication_id FROM social_outbox WHERE id = ? AND status = 'failed')`,
        now,
        input.id,
      ),
    );
  }

  async markFailed(input: Input<"markFailed">) {
    const now = new Date().toISOString();
    return this.transition(
      this.statement(
        `UPDATE social_outbox SET
           status = 'failed', revision = revision + 1, lease_token = NULL, lease_expires_at = NULL,
           retry_safe = ?, last_error_code = ?, last_error_message = ?, failed_at = COALESCE(failed_at, ?),
           updated_at = ?
         WHERE id = ? AND status = 'processing' AND lease_token = ? RETURNING *`,
        input.retrySafe ? 1 : 0,
        clip(input.errorCode, 80),
        clip(input.errorMessage, 400),
        now,
        now,
        input.id,
        input.workerToken,
      ),
      this.publicationFollows({ where: "id = ?", values: [input.id] }, "status = 'failed'", [], now),
    );
  }

  async applyProviderStatus(input: Input<"applyProviderStatus">) {
    const messageId = input.providerMessageId.trim();
    if (input.provider !== "whatsapp"
      || !whatsappProviderStatuses.includes(input.status)
      || messageId.length < 1 || messageId.length > 512) {
      invalid();
    }
    const occurredAt = instant(input.occurredAt);
    const now = new Date().toISOString();
    const incomingRank = { read: 4, delivered: 3, failed: 2, sent: 1 }[input.status];
    const failed = input.status === "failed";
    const current = providerStatusRank("provider_status");

    // Statuses only move forward: a later rank always applies, an equal rank only with a newer timestamp.
    const [updated] = await this.run([
      this.statement(
        `UPDATE social_outbox SET
           status = CASE WHEN ?1 = 'failed' THEN 'failed' ELSE 'sent' END,
           revision = revision + 1, provider_status = ?1, provider_status_at = ?2,
           retry_safe = CASE WHEN ?1 = 'failed' THEN 0 ELSE retry_safe END,
           delivered_at = CASE WHEN ?1 IN ('delivered', 'read') THEN COALESCE(delivered_at, ?2) ELSE delivered_at END,
           read_at = CASE WHEN ?1 = 'read' THEN COALESCE(read_at, ?2) ELSE read_at END,
           failed_at = CASE WHEN ?1 = 'failed' THEN COALESCE(failed_at, ?2) ELSE NULL END,
           last_error_code = CASE WHEN ?1 = 'failed' THEN ?3 ELSE NULL END,
           last_error_message = CASE WHEN ?1 = 'failed' THEN ?4 ELSE NULL END,
           updated_at = ?7
         WHERE provider = 'whatsapp' AND provider_message_id = ?5 AND status IN ('sent', 'failed')
           AND ?6 >= ${current}
           AND (provider_status_at IS NULL OR ?2 > provider_status_at
                OR (?2 = provider_status_at AND ?6 > ${current}))
         RETURNING *`,
        input.status,
        occurredAt,
        clip(input.errorCode ?? "whatsapp_delivery_failed", 80),
        clip(input.errorMessage ?? "WhatsApp delivery failed.", 400),
        messageId,
        incomingRank,
        now,
      ),
      this.statement(
        failed
          ? `UPDATE social_publications SET status = 'failed', updated_at = ?
             WHERE changes() > 0 AND id = (
               SELECT publication_id FROM social_outbox WHERE provider = 'whatsapp' AND provider_message_id = ?)`
          : `UPDATE social_publications SET status = 'published', published_at = COALESCE(published_at, ?2), updated_at = ?1
             WHERE changes() > 0 AND id = (
               SELECT publication_id FROM social_outbox WHERE provider = 'whatsapp' AND provider_message_id = ?3)`,
        ...(failed ? [now, messageId] : [now, occurredAt, messageId]),
      ),
    ]);
    return updated[0] ? toJob(updated[0]) : null;
  }
}
