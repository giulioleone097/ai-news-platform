import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20260810120000_social_outbox.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("social outbox migration", () => {
  it("enforces one idempotent job per publication", () => {
    expect(migration).toContain("publication_id uuid not null unique");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("idempotency key reuse mismatch");
  });

  it("claims atomically without holding locks during provider fetch", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("mark_social_outbox_dispatch_started");
    expect(migration).toContain("lease_expired_after_dispatch");
    expect(migration).toContain("max_attempts_before_dispatch");
    expect(migration).toContain("where status = 'pending'");
  });

  it("keeps outbox data private and grants RPCs only to service role", () => {
    expect(migration).toContain("alter table public.social_outbox force row level security");
    expect(migration).toContain("revoke all on table public.social_outbox from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_social_outbox");
    expect(migration).toContain("to service_role");
  });

  it("blocks unsafe manual retry after an ambiguous provider outcome", () => {
    expect(migration).toContain("and retry_safe = true");
    expect(migration).toContain("failed job cannot be retried safely");
  });

  it("requeues only cancelled or duplicate-safe failed jobs with optimistic concurrency", () => {
    expect(migration).toContain("create or replace function public.requeue_social_outbox");
    expect(migration).toContain("and revision = p_expected_revision");
    expect(migration).toContain("status = 'cancelled'");
    expect(migration).toContain("status = 'failed' and retry_safe = true");
    expect(migration).toContain("requeue_source_revision = p_expected_revision");
    expect(migration).toContain("attempts = 0");
    expect(migration).toContain("provider_message_id = null");
  });

  it("applies provider callbacks in monotonic event-time order", () => {
    expect(migration).toContain("provider_status_at timestamptz");
    expect(migration).toContain("v_incoming_rank >= case provider_status");
    expect(migration).toContain("p_occurred_at > provider_status_at");
    expect(migration).toContain("p_occurred_at = provider_status_at");
    expect(migration).toContain("and v_incoming_rank > case provider_status");
    expect(migration).toContain("when 'read' then 4");
    expect(migration).toContain("when 'delivered' then 3");
    expect(migration).toContain("when 'failed' then 2");
  });
});
