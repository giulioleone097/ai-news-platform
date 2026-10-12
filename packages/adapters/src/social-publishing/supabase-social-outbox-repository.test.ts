import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { publicSocialOutboxJob } from "@atlasnews/core/social-publishing/domain/social-publication";
import { mapSocialOutboxJob, SupabaseSocialOutboxRepository } from "./supabase-social-outbox-repository";

describe("Supabase social outbox mapping", () => {
  it("carries the provider event timestamp into the public readback", () => {
    const job = mapSocialOutboxJob({
      id: "fc7c6331-56a3-42dc-8932-6b4394bc4c9f",
      publication_id: "9b984e7b-1aa8-4f2a-bd9b-f799f4b7529e",
      provider: "whatsapp",
      idempotency_key: "social:whatsapp:5e9f62b40cc1470cb41e67d9e77c2565",
      payload: { text: "Private briefing", recipient: "15551234567" },
      status: "sent",
      attempts: 1,
      max_attempts: 5,
      available_at: "2026-08-10T07:59:00.000Z",
      lease_token: null,
      lease_expires_at: null,
      dispatch_started_at: "2026-08-10T07:59:30.000Z",
      provider_message_id: "wamid.HBgMNTU1MTIzNDU2NzgVAgARGBI5",
      provider_url: null,
      provider_status: "delivered",
      provider_status_at: "2026-08-10T08:00:00.000Z",
      revision: 4,
      retry_safe: false,
      last_error_code: null,
      last_error_message: null,
      sent_at: "2026-08-10T07:59:31.000Z",
      failed_at: null,
      delivered_at: "2026-08-10T08:00:00.000Z",
      read_at: null,
      created_at: "2026-08-10T07:59:00.000Z",
      updated_at: "2026-08-10T08:00:00.000Z",
    });

    expect(job.providerStatusAt).toBe("2026-08-10T08:00:00.000Z");
    expect(publicSocialOutboxJob(job)).toMatchObject({
      providerStatus: "delivered",
      providerStatusAt: "2026-08-10T08:00:00.000Z",
      revision: 4,
    });
  });
});

describe("SupabaseSocialOutboxRepository edits and batches", () => {
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    publication_id: "9b984e7b-1aa8-4f2a-bd9b-f799f4b7529e",
    provider: "linkedin",
    idempotency_key: "social:linkedin:5e9f62b40cc1470cb41e67d9e77c2565",
    payload: { text: "Corrected" },
    status: "pending",
    attempts: 0,
    max_attempts: 4,
    available_at: "2026-10-12T09:00:00.000Z",
    lease_token: null,
    lease_expires_at: null,
    dispatch_started_at: null,
    provider_message_id: null,
    provider_url: null,
    provider_status: null,
    provider_status_at: null,
    revision: 1,
    retry_safe: true,
    last_error_code: null,
    last_error_message: null,
    sent_at: null,
    failed_at: null,
    delivered_at: null,
    read_at: null,
    created_at: "2026-10-12T08:00:00.000Z",
    updated_at: "2026-10-12T08:30:00.000Z",
    ...overrides,
  });
  const first = "fc7c6331-56a3-42dc-8932-6b4394bc4c9f";
  const second = "0c7c6331-56a3-42dc-8932-6b4394bc4c9f";

  it("edits a waiting job through one RPC that carries the revision it was read at", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row(first), error: null });
    const job = await new SupabaseSocialOutboxRepository({ rpc } as unknown as SupabaseClient).updatePending({
      id: first,
      expectedRevision: 0,
      provider: "linkedin",
      payload: { text: "Corrected" },
      availableAt: "2026-10-12T09:00:00.000Z",
      maxAttempts: 4,
    });
    expect(rpc).toHaveBeenCalledWith("update_pending_social_outbox", {
      p_id: first,
      p_expected_revision: 0,
      p_provider: "linkedin",
      p_payload: { text: "Corrected" },
      p_available_at: "2026-10-12T09:00:00.000Z",
      p_max_attempts: 4,
    });
    expect(job).toMatchObject({ id: first, revision: 1, maxAttempts: 4, payload: { text: "Corrected" } });
  });

  it("cancels several jobs through one RPC and returns them in the order asked", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row(second, { status: "cancelled" }), row(first, { status: "cancelled" })], error: null });
    const jobs = await new SupabaseSocialOutboxRepository({ rpc } as unknown as SupabaseClient).cancelPendingMany([first, second]);
    expect(rpc).toHaveBeenCalledWith("cancel_social_outbox_batch", { p_ids: [first, second] });
    expect(jobs.map((job) => [job.id, job.status])).toEqual([[first, "cancelled"], [second, "cancelled"]]);
  });

  it("fails with the persistence error when Postgres refuses or returns fewer jobs than asked", async () => {
    const refused = new SupabaseSocialOutboxRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "not pending" } }) } as unknown as SupabaseClient);
    await expect(refused.cancelPendingMany([first])).rejects.toMatchObject({ code: "persistence_error" });
    await expect(refused.updatePending({ id: first, expectedRevision: 0, provider: "x", payload: { text: "x" }, availableAt: "2026-10-12T09:00:00.000Z", maxAttempts: 3 }))
      .rejects.toMatchObject({ code: "persistence_error" });
    const short = new SupabaseSocialOutboxRepository({ rpc: vi.fn().mockResolvedValue({ data: [row(first)], error: null }) } as unknown as SupabaseClient);
    await expect(short.cancelPendingMany([first, second])).rejects.toMatchObject({ code: "persistence_error" });
  });
});
