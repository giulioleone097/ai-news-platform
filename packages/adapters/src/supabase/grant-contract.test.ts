import { readdirSync, readFileSync } from "node:fs";
import type { ArticleDraftInput } from "@atlasnews/core/editorial/domain/article";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseEditorialRepository } from "../editorial/supabase-editorial-repository";

// Static check of the database contract, without Docker: the relations that each Supabase client role
// reaches through SupabaseEditorialRepository must be granted to that role by the migrations. It cannot
// see RLS policies or a stack's default privileges; `supabase db reset` plus a live run covers those.

const migrationsUrl = new URL("../../../../supabase/migrations/", import.meta.url);
type Role = "anon" | "authenticated" | "service_role";

/** Replays grant/revoke statements in file order. A relation nobody granted starts with no privileges. */
function declaredGrants() {
  const tables = new Map<string, Map<string, Set<string>>>();
  // PUBLIC may execute a function until a migration revokes it.
  const functions = new Map<string, Set<string>>();
  const statement =
    /\b(grant|revoke)\s+([a-z_, ]+?)\s+on\s+(all tables in schema public|function\s+public\.\w+\s*\([^)]*\)|[a-z_.,\s]+?)\s+(?:to|from)\s+([a-z_, ]+?)\s*(?:;|'|\$)/gi;

  for (const file of readdirSync(migrationsUrl).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(new URL(file, migrationsUrl), "utf8").replace(/--.*$/gm, "");
    for (const match of sql.matchAll(statement)) {
      const [, verb, privileges, object, grantees] = match.map((part) => part?.trim().toLowerCase());
      const granted = grantees.split(",").map((role) => role.trim());
      const privilegeList = privileges.split(",").map((privilege) => privilege.trim());
      if (object.startsWith("function ")) {
        const name = /public\.(\w+)/.exec(object)![1];
        const holders = functions.get(name) ?? new Set(["public"]);
        for (const role of granted) {
          if (verb === "grant") holders.add(role);
          else holders.delete(role);
        }
        functions.set(name, holders);
        continue;
      }
      if (/^(schema|sequence)\b/.test(object)) continue;
      const targets = object === "all tables in schema public"
        ? [...tables.keys()]
        : object.replace(/^table\s+/, "").split(",").map((name) => name.trim().replace(/^public\./, ""));
      for (const table of targets) {
        const byRole = tables.get(table) ?? new Map<string, Set<string>>();
        tables.set(table, byRole);
        for (const role of granted) {
          const held = byRole.get(role) ?? new Set<string>();
          for (const privilege of privilegeList) {
            if (verb === "grant") held.add(privilege === "all" ? "all" : privilege);
            else if (privilege === "all") held.clear();
            else held.delete(privilege);
          }
          byRole.set(role, held);
        }
      }
    }
  }

  const can = (role: Role, table: string, privilege: string) => {
    const held = tables.get(table)?.get(role);
    return Boolean(held && (held.has("all") || held.has(privilege)));
  };
  const canExecute = (role: Role, name: string) => {
    const holders = functions.get(name);
    return !holders || holders.has("public") || holders.has(role);
  };
  return { can, canExecute, tables };
}

type Access = { relation: string; privilege: "select" | "insert" | "update" | "delete" | "execute" };

/** A client that records which relations are touched and answers every request with an empty result. */
function recordingClient() {
  const accesses: Access[] = [];
  const knownEmbeds = (select: string) =>
    [...select.matchAll(/(?:\w+:)?(\w+)(?:![\w]+)?\(/g)].map((match) => match[1]).filter((name) => !name.endsWith("_id"));

  const query = (table: string) => {
    const privileges: Access["privilege"][] = [];
    const embeds: string[] = [];
    const chain: unknown = new Proxy(() => undefined, {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: unknown) => void) => {
            for (const relation of [table, ...embeds]) {
              for (const privilege of privileges.length ? privileges : ["select" as const]) {
                accesses.push({ relation, privilege: relation === table ? privilege : "select" });
              }
            }
            resolve({ data: [], error: null, count: 0 });
          };
        }
        return (...args: unknown[]) => {
          if (property === "select") {
            if (typeof args[0] === "string") embeds.push(...knownEmbeds(args[0]));
          } else if (property === "insert" || property === "delete" || property === "update") {
            privileges.push(property);
          } else if (property === "upsert") {
            privileges.push("insert", "update");
          }
          return chain;
        };
      },
    });
    return chain;
  };

  const client = {
    from: query,
    rpc(name: string) {
      accesses.push({ relation: name, privilege: "execute" });
      return Promise.resolve({ data: null, error: null });
    },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [], error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        upload: () => Promise.resolve({ data: null, error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  } as unknown as SupabaseClient;
  return { client, accesses };
}

const uuid = "00000000-0000-4000-8000-000000000000";
const draft: ArticleDraftInput = {
  locale: "en",
  title: "A title long enough",
  excerpt: "An excerpt that is long enough to pass.",
  content: "Content that is long enough to pass.",
  categorySlug: "research",
  status: "draft",
  distribution: ["x"],
};

async function swallow(...calls: Array<() => Promise<unknown>>) {
  for (const call of calls) await call().catch(() => undefined);
}

describe("Supabase grants declared by the migrations", () => {
  const grants = declaredGrants();

  it("lets the anonymous public read only what the public repository touches", async () => {
    const { client, accesses } = recordingClient();
    const repository = new SupabaseEditorialRepository(client, { audience: "public" });
    await swallow(
      () => repository.listPublished({ locale: "en", category: "research", entity: "openai", claimStatus: "analysis", query: "agents" }),
      () => repository.findBySlug("a-slug", "en"),
      () => repository.listCategories("en"),
      () => repository.listEntities("en"),
      () => repository.findEntityBySlug("openai", "en"),
      () => repository.listEntityTimeline("openai", "en"),
    );

    expect(accesses.length).toBeGreaterThan(0);
    const denied = accesses.filter(({ relation, privilege }) =>
      privilege === "execute" ? !grants.canExecute("anon", relation) : !grants.can("anon", relation, privilege));
    expect(denied).toEqual([]);
  });

  it("never grants the anonymous role editorial workflow or subscriber data", () => {
    for (const table of ["social_publications", "social_outbox", "newsletter_subscriptions", "newsletter_campaigns", "profiles"]) {
      expect(grants.can("anon", table, "select"), table).toBe(false);
    }
  });

  it("grants the service role every relation the admin editorial repository reaches", async () => {
    const { client, accesses } = recordingClient();
    const repository = new SupabaseEditorialRepository(client, { audience: "editorial", authorId: uuid });
    await swallow(
      () => repository.listPublished({ locale: "en", entity: "openai" }),
      () => repository.listForStudio("en"),
      () => repository.findBySlug("a-slug", "en"),
      () => repository.findById(uuid, "en"),
      () => repository.listCategories("en"),
      () => repository.save(draft),
      () => repository.delete(uuid),
      () => repository.setDistributionChannels(uuid, ["x"]),
      () => repository.listEntities("en"),
      () => repository.findEntityBySlug("openai", "en"),
      () => repository.listEntityTimeline("openai", "en"),
      () => repository.listSubscriptions({ locale: "en" }),
      () => repository.updateSubscriptionStatus(uuid, "unsubscribed"),
      () => repository.listPublications("en"),
      () => repository.updatePublication({ id: uuid, status: "draft" }),
      () => repository.isAssetReferenced("cover.png"),
    );

    expect(accesses.length).toBeGreaterThan(0);
    const denied = accesses.filter(({ relation, privilege }) =>
      privilege === "execute" ? !grants.canExecute("service_role", relation) : !grants.can("service_role", relation, privilege));
    expect(denied).toEqual([]);
  });

  it("lets the service role read editor profiles for the MCP editor directory", () => {
    // apps/mcp/src/auth/editors.ts calls PostgREST directly, so the repository recording cannot see it.
    expect(grants.can("service_role", "profiles", "select")).toBe(true);
  });
});
