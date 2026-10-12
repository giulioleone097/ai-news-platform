import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createSupabaseEditorialRepository } from "./supabase-editorial-repository";

type Call = [method: string, ...args: unknown[]];

/** A query builder that records every call and resolves to `result` when awaited. */
function fakeClient(result: unknown) {
  const calls: Call[] = [];
  const query: unknown = new Proxy({}, {
    get(_target, property: string) {
      if (property === "then") {
        return (resolve: (value: unknown) => unknown) => resolve(result);
      }
      return (...args: unknown[]) => {
        calls.push([property, ...args]);
        return query;
      };
    },
  });
  return { calls, client: { from: () => query, rpc: (...args: unknown[]) => { calls.push(["rpc", ...args]); return query; } } as unknown as SupabaseClient };
}

const row = (id: string, status: string) => ({
  id,
  email: `${id}@example.com`,
  source: "site",
  locale: "en",
  status,
  consented_at: "2026-10-01T10:00:00Z",
  unsubscribed_at: null,
  created_at: "2026-10-01T10:00:00Z",
});

describe("SupabaseEditorialRepository newsletter subscriptions", () => {
  it("lists pending and suppressed subscribers instead of hiding them", async () => {
    const statuses = ["pending", "active", "unsubscribed", "suppressed"];
    const { calls, client } = fakeClient({
      count: 4,
      data: statuses.map((status) => row(status, status)),
      error: null,
    });
    const repository = createSupabaseEditorialRepository(client, { audience: "editorial" });

    const page = await repository.listSubscriptions({ locale: "en" });

    expect(page.items.map((item) => item.status)).toEqual(statuses);
    expect(page.total).toBe(4);
    expect(calls.some(([method, column]) => method === "in" && column === "status")).toBe(false);
  });

  it("filters by one status when asked", async () => {
    const { calls, client } = fakeClient({ count: 1, data: [row("a", "suppressed")], error: null });
    const repository = createSupabaseEditorialRepository(client, { audience: "editorial" });

    await repository.listSubscriptions({ locale: "en", status: "suppressed" });

    expect(calls).toContainEqual(["eq", "status", "suppressed"]);
  });

  it("finds no subscriber and no article for an id that is not a uuid, without asking the database", async () => {
    const { calls, client } = fakeClient({ data: null, error: { message: "invalid input syntax for type uuid" } });
    const repository = createSupabaseEditorialRepository(client, { audience: "editorial" });

    expect(await repository.findSubscription("not-a-uuid")).toBeNull();
    expect(await repository.findById("not-a-uuid", "en")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("refuses direct reactivation and unsubscribes through the database function", async () => {
    const { calls, client } = fakeClient({ data: true, error: null });
    const repository = createSupabaseEditorialRepository(client, { audience: "editorial" });

    await expect(repository.updateSubscriptionStatus("id", "active" as never)).rejects.toThrow("double opt-in");
    expect(calls).toEqual([]);
    await repository.updateSubscriptionStatus("id", "unsubscribed");
    expect(calls).toEqual([["rpc", "admin_unsubscribe_newsletter_subscription", { p_subscription_id: "id" }]]);
  });
});
