import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260810110000_comments.sql"),
  "utf8",
);

describe("comment persistence security contract", () => {
  it("forces RLS on every private and public comment relation", () => {
    for (const table of [
      "comments",
      "comment_reports",
      "comment_moderation_audit",
      "comment_rate_limits",
      "comment_notification_subscriptions",
      "comment_notifications",
    ]) {
      expect(migration).toContain(`alter table public.${table} force row level security;`);
    }
  });

  it("exposes only approved comments and revokes all private relations", () => {
    expect(migration).toContain("create policy comments_public_approved_read");
    expect(migration).toContain("status = 'approved'");
    expect(migration).toContain("revoke all on table public.comment_reports from anon, authenticated;");
    expect(migration).toContain("revoke all on table public.comment_notification_subscriptions from anon, authenticated;");
    expect(migration).not.toMatch(/grant select \([^;]*email/iu);
    expect(migration).toContain("and public.comment_parent_is_approved(comment.parent_id)");
    expect(migration).toContain("and public.comment_parent_is_approved(parent_id)");
  });

  it("keeps abuse controls and approved-reply notifications transactional", () => {
    expect(migration).toContain("on conflict (identity_hash, action, window_started_at)");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("p_status = 'approved'");
    expect(migration).toContain("'comment-reply:' || p_comment_id::text");
    expect(migration).toContain("select coalesce(");
  });

  it("uses an unambiguous timestamp variable in the atomic rate limiter", () => {
    const rateLimitFunction = migration.slice(
      migration.indexOf("create or replace function public.take_comment_rate_limit"),
      migration.indexOf("revoke all on function public.take_comment_rate_limit"),
    );
    expect(rateLimitFunction).toContain("rate_now timestamptz := clock_timestamp()");
    expect(rateLimitFunction).not.toContain("current_time");
  });

  it("relies on PostgreSQL text semantics instead of constructing an invalid NUL character", () => {
    const createFunction = migration.slice(
      migration.indexOf("create or replace function public.create_comment"),
      migration.indexOf("create or replace function public.edit_own_comment"),
    );
    expect(createFunction).not.toContain("chr(0)");
  });

  it("keeps owner feeds actor- and parent-scoped with keyset pagination", () => {
    const ownerFunction = migration.slice(
      migration.indexOf("create or replace function public.list_own_comments"),
      migration.indexOf("create or replace function public.create_comment"),
    );
    expect(ownerFunction).toContain("comment.parent_id is not distinct from p_parent_id");
    expect(ownerFunction).toContain("comment.author_user_id = p_actor_user_id");
    expect(ownerFunction).toContain("p_owner_guest_identity_hash = p_guest_identity_hash");
    expect(ownerFunction).toContain("comment.guest_identity_hash = p_owner_guest_identity_hash");
    expect(ownerFunction).toContain("comment.status in ('pending', 'approved', 'rejected')");
    expect(ownerFunction).toContain("(comment.created_at, comment.id) < (p_cursor_created_at, p_cursor_id)");
    expect(migration).toContain("comments_authenticated_owner_feed_idx");
    expect(migration).toContain("comments_guest_owner_feed_idx");
    expect(migration).toContain("grant execute on function public.list_own_comments(");
    expect(migration).not.toMatch(
      /grant execute on function public\.list_own_comments\([\s\S]*?\) to anon/iu,
    );
  });

  it("requires an eligible leased subscription immediately before notification dispatch", () => {
    const startFunction = migration.slice(
      migration.indexOf("create or replace function public.start_comment_notification_delivery"),
      migration.indexOf("create or replace function public.complete_comment_notification"),
    );
    expect(startFunction).toContain("notification.status = 'processing'");
    expect(startFunction).toContain("notification.worker_id = trim(p_worker_id)");
    expect(startFunction).toContain("subscription.unsubscribed_at is null");
    expect(startFunction).toContain("subscription.verification_expires_at >= now()");
    expect(startFunction).toContain("dispatch_started_at = now()");
    expect(migration).toContain("status in ('pending', 'failed', 'processing')");
    expect(migration).toContain("and dispatch_started_at is null;");
  });
});
