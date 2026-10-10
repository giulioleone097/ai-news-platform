import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20261010120000_mcp_event_subscriptions.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("MCP events migration", () => {
  it("keeps secrets and deliveries private to the service role", () => {
    for (const table of ["mcp_event_subscriptions", "mcp_event_deliveries"]) {
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
      expect(migration).toContain(`grant select, insert, update, delete on table public.${table} to service_role`);
    }
    expect(migration).not.toContain("create policy");
    expect(migration).toContain("grant execute on function public.claim_mcp_event_deliveries");
  });

  it("deduplicates deliveries per subscription and article", () => {
    expect(migration).toContain("unique (subscription_id, article_id)");
    expect(migration).toContain("references public.mcp_event_subscriptions(id) on delete cascade");
  });

  it("claims with leases without holding locks during delivery", () => {
    expect(migration).toContain("for update of delivery skip locked");
    expect(migration).toContain("lease_expires_at <= now()");
    expect(migration).toContain("subscription.status = 'active'");
    expect(migration).toContain("subscription.expires_at > now()");
    expect(migration).toContain("lease_expired_max_attempts");
  });

  it("only stores signing secrets in the whsec format and bounds stored data", () => {
    expect(migration).toContain("secret ~ '^whsec_'");
    expect(migration).toContain("callback_url ~ '^https://'");
    expect(migration).toContain("octet_length(event::text) <= 262144");
  });
});
