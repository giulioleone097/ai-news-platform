import { readdirSync, readFileSync } from "node:fs";
import type { ArticleDraftInput } from "@atlasnews/core/editorial/domain/article";
import type { CategoryWrite } from "@atlasnews/core/editorial/domain/category";
import type { EntityWrite } from "@atlasnews/core/editorial/domain/entity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseEditorialRepository } from "../editorial/supabase-editorial-repository";

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
const category: CategoryWrite = {
  translationKey: "research-cat",
  position: 1,
  translations: { en: { slug: "research", name: "Research", description: "Research news." } },
};
const entity: EntityWrite = {
  kind: "company",
  slug: "openai",
  name: "OpenAI",
  officialUrl: null,
  parentSlug: null,
  descriptions: { en: "An AI company." },
};

async function swallow(...calls: Array<() => Promise<unknown>>) {
  for (const call of calls) await call().catch(() => undefined);
}

// Definer functions that an earlier migration granted to anon or authenticated and the sweep migration
// withdraws on purpose (name:role). subscribe_newsletter was already revoked by the newsletter migration.
const intentionallyDropped = new Set<string>(["subscribe_newsletter:anon", "subscribe_newsletter:authenticated"]);

describe("Supabase grants declared by the migrations", () => {
  const grants = declaredGrants();

  it("lets the anonymous public read only what the public repository touches", async () => {
    const { client, accesses } = recordingClient();
    const repository = createSupabaseEditorialRepository(client, { audience: "public" });
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
    const repository = createSupabaseEditorialRepository(client, { audience: "editorial", authorId: uuid });
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
      () => repository.saveMany([draft]),
      () => repository.setPublished([uuid], true),
      () => repository.deleteMany([uuid]),
      () => repository.listCategoryRecords(),
      () => repository.createCategories([category]),
      () => repository.updateCategories([category]),
      () => repository.deleteCategories(["research-cat"]),
      () => repository.countCategoryArticles(["research-cat"]),
      () => repository.listEntityRecords(),
      () => repository.createEntities([entity]),
      () => repository.updateEntities([entity]),
      () => repository.deleteEntities(["openai"]),
      () => repository.countEntityStories(["openai"]),
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

  describe("SECURITY DEFINER functions", () => {
    const sweepFile = "20261014090000_restrict_function_execute.sql";
    const files = readdirSync(migrationsUrl).filter((name) => name.endsWith(".sql")).sort();
    const sql = (file: string) => readFileSync(new URL(file, migrationsUrl), "utf8").replace(/--.*$/gm, "");

    const definerFunctions = new Set<string>();
    for (const file of files) {
      for (const match of sql(file).matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\$\w*\$/gi)) {
        if (/security\s+definer/i.test(match[2])) definerFunctions.add(match[1].toLowerCase());
      }
    }
    const clientGrants = (file: string) =>
      [...sql(file).matchAll(/grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\([^)]*\)\s*to\s+([a-z_,\s]+?);/gi)]
        .map((match) => ({ name: match[1].toLowerCase(), roles: match[2].toLowerCase().split(",").map((role) => role.trim()) }))
        .filter(({ name, roles }) => definerFunctions.has(name) && roles.some((role) => role === "anon" || role === "authenticated"));

    it("sweeps every definer function and changes the default privileges", () => {
      const sweep = sql(sweepFile);
      expect(sweep).toMatch(/p\.prosecdef/);
      expect(sweep).toMatch(/revoke all on function %s from public, anon, authenticated/);
      expect(sweep).toMatch(/alter default privileges revoke execute on functions from public/);
      expect(sweep).toMatch(/alter default privileges in schema public revoke execute on functions from anon, authenticated/);
    });

    it("re-grants every definer function that an earlier migration opened to anon or authenticated, per role", () => {
      const regranted = clientGrants(sweepFile);
      const holds = (name: string, role: string) => regranted.some((grant) => grant.name === name && grant.roles.includes(role));
      const lost = files
        .filter((file) => file < sweepFile)
        .flatMap((file) => clientGrants(file).map((grant) => ({ file, ...grant })))
        .flatMap(({ file, name, roles }) =>
          roles.filter((role) => role === "anon" || role === "authenticated")
            // The sweep revokes these on purpose; a later revoke in the same history is checked by the live query.
            .filter((role) => !holds(name, role) && !intentionallyDropped.has(`${name}:${role}`))
            .map((role) => `${file}: ${name} -> ${role}`));
      expect(lost).toEqual([]);
    });

    it("grants no definer function to anon or authenticated after the sweep without a reviewed change to this test", () => {
      const later = files.filter((file) => file > sweepFile).flatMap((file) => clientGrants(file).map((grant) => `${file}: ${grant.name}`));
      expect(later).toEqual([]);
    });
  });
});

