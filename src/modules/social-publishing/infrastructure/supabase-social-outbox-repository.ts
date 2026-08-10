import type { SupabaseClient } from "@supabase/supabase-js";

import { SocialPublishingError } from "../domain/errors";
import type { SocialOutboxRepository } from "../domain/ports";
import {
  socialOutboxStatuses,
  socialProviders,
  type SocialOutboxJob,
  type SocialOutboxQuery,
  type SocialProvider,
  type SocialPublishPayload,
} from "../domain/social-publication";

function persistenceError(): SocialPublishingError {
  return new SocialPublishingError("Social outbox persistence failed.", "persistence_error");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw persistenceError();
  return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value) throw persistenceError();
  return value;
}

function nullableString(value: unknown) {
  if (value === null) return null;
  return requiredString(value);
}

function parsePayload(value: unknown): SocialPublishPayload {
  const payload = record(value);
  const text = requiredString(payload.text);
  const articleUrl = payload.articleUrl === undefined ? undefined : requiredString(payload.articleUrl);
  const recipient = payload.recipient === undefined ? undefined : requiredString(payload.recipient);
  return { text, articleUrl, recipient };
}

export function mapSocialOutboxJob(value: unknown): SocialOutboxJob {
  const row = record(value);
  const provider = requiredString(row.provider);
  const status = requiredString(row.status);
  if (!socialProviders.includes(provider as SocialProvider)
    || !socialOutboxStatuses.includes(status as SocialOutboxJob["status"])) {
    throw persistenceError();
  }
  if (typeof row.attempts !== "number" || typeof row.max_attempts !== "number"
    || typeof row.revision !== "number"
    || typeof row.retry_safe !== "boolean") {
    throw persistenceError();
  }
  return {
    id: requiredString(row.id),
    publicationId: requiredString(row.publication_id),
    provider: provider as SocialProvider,
    idempotencyKey: requiredString(row.idempotency_key),
    payload: parsePayload(row.payload),
    status: status as SocialOutboxJob["status"],
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: requiredString(row.available_at),
    leaseToken: nullableString(row.lease_token),
    leaseExpiresAt: nullableString(row.lease_expires_at),
    dispatchStartedAt: nullableString(row.dispatch_started_at),
    providerMessageId: nullableString(row.provider_message_id),
    providerUrl: nullableString(row.provider_url),
    providerStatus: nullableString(row.provider_status),
    providerStatusAt: nullableString(row.provider_status_at),
    revision: row.revision,
    retrySafe: row.retry_safe,
    lastErrorCode: nullableString(row.last_error_code),
    lastErrorMessage: nullableString(row.last_error_message),
    sentAt: nullableString(row.sent_at),
    failedAt: nullableString(row.failed_at),
    deliveredAt: nullableString(row.delivered_at),
    readAt: nullableString(row.read_at),
    createdAt: requiredString(row.created_at),
    updatedAt: requiredString(row.updated_at),
  };
}

function unwrapRpcRow(data: unknown) {
  return Array.isArray(data) ? data[0] : data;
}

export class SupabaseSocialOutboxRepository implements SocialOutboxRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async rpcRow(name: string, parameters: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(name, parameters);
    if (error || !data) throw persistenceError();
    return mapSocialOutboxJob(unwrapRpcRow(data));
  }

  enqueue(input: Parameters<SocialOutboxRepository["enqueue"]>[0]) {
    return this.rpcRow("enqueue_social_outbox", {
      p_publication_id: input.publicationId,
      p_provider: input.provider,
      p_idempotency_key: input.idempotencyKey,
      p_payload: input.payload,
      p_scheduled_for: input.scheduledFor,
      p_max_attempts: input.maxAttempts,
    });
  }

  requeue(input: Parameters<SocialOutboxRepository["requeue"]>[0]) {
    return this.rpcRow("requeue_social_outbox", {
      p_id: input.id,
      p_expected_revision: input.expectedRevision,
      p_publication_id: input.publicationId,
      p_provider: input.provider,
      p_payload: input.payload,
      p_scheduled_for: input.scheduledFor,
      p_max_attempts: input.maxAttempts,
    });
  }

  async getById(id: string) {
    const { data, error } = await this.client
      .from("social_outbox")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistenceError();
    return data ? mapSocialOutboxJob(data) : null;
  }

  async getByIdempotencyKey(idempotencyKey: string) {
    const { data, error } = await this.client
      .from("social_outbox")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw persistenceError();
    return data ? mapSocialOutboxJob(data) : null;
  }

  async list(query: Required<Pick<SocialOutboxQuery, "limit" | "offset">> & SocialOutboxQuery) {
    let request = this.client
      .from("social_outbox")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (query.provider) request = request.eq("provider", query.provider);
    if (query.status) request = request.eq("status", query.status);
    const { count, data, error } = await request.range(query.offset, query.offset + query.limit - 1);
    if (error || count === null) throw persistenceError();
    const items = (data ?? []).map(mapSocialOutboxJob);
    return {
      items,
      total: count,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + items.length < count,
    };
  }

  cancelPending(id: string) {
    return this.rpcRow("cancel_social_outbox", { p_id: id });
  }

  retryFailed(id: string) {
    return this.rpcRow("retry_failed_social_outbox", { p_id: id });
  }

  async claim(input: Parameters<SocialOutboxRepository["claim"]>[0]) {
    const { data, error } = await this.client.rpc("claim_social_outbox", {
      p_worker_token: input.workerToken,
      p_limit: input.limit,
      p_lease_seconds: input.leaseSeconds,
    });
    if (error || !Array.isArray(data)) throw persistenceError();
    return data.map(mapSocialOutboxJob);
  }

  markDispatchStarted(id: string, workerToken: string) {
    return this.rpcRow("mark_social_outbox_dispatch_started", {
      p_id: id,
      p_worker_token: workerToken,
    });
  }

  markSent(
    id: string,
    workerToken: string,
    result: Parameters<SocialOutboxRepository["markSent"]>[2],
  ) {
    return this.rpcRow("complete_social_outbox", {
      p_id: id,
      p_worker_token: workerToken,
      p_provider_message_id: result.messageId,
      p_provider_url: result.url,
      p_provider_status: result.status,
    });
  }

  markRetry(input: Parameters<SocialOutboxRepository["markRetry"]>[0]) {
    return this.rpcRow("retry_social_outbox", {
      p_id: input.id,
      p_worker_token: input.workerToken,
      p_available_at: input.availableAt,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
    });
  }

  markFailed(input: Parameters<SocialOutboxRepository["markFailed"]>[0]) {
    return this.rpcRow("fail_social_outbox", {
      p_id: input.id,
      p_worker_token: input.workerToken,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
      p_retry_safe: input.retrySafe,
    });
  }

  async applyProviderStatus(input: Parameters<SocialOutboxRepository["applyProviderStatus"]>[0]) {
    const { data, error } = await this.client.rpc("apply_social_provider_status", {
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_status: input.status,
      p_occurred_at: input.occurredAt,
      p_error_code: input.errorCode ?? null,
      p_error_message: input.errorMessage ?? null,
    });
    if (error) throw persistenceError();
    const row = unwrapRpcRow(data);
    return row ? mapSocialOutboxJob(row) : null;
  }
}
