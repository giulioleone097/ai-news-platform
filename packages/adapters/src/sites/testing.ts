import { readFileSync } from "node:fs";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import type { D1Database, R2Bucket } from "./cloudflare";
import { setSitesBindings } from "./bindings";

// Test support only: a real D1 database and R2 bucket from Miniflare (the workerd runtime that Sites
// runs on), with the Sites migrations applied the way Drizzle's migrator applies them.

const migrationsUrl = new URL("../../../../apps/web/drizzle/", import.meta.url);

interface Journal {
  entries: { idx: number; tag: string }[];
}

/** The statements of each migration in journal order, split on Drizzle's statement breakpoints. */
export function readSitesMigrations() {
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsUrl), "utf8")) as Journal;
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => ({
      tag: entry.tag,
      statements: readFileSync(new URL(`${entry.tag}.sql`, migrationsUrl), "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.replace(/--.*$/gm, "").trim().length > 0),
    }));
}

export interface SitesTestStore {
  database: D1Database;
  media: R2Bucket;
  /** Also clears the bindings that `setSitesBindings` registered. */
  dispose(): Promise<void>;
}

/** A fresh, migrated D1 database plus an empty R2 bucket. `register` also makes them the Sites bindings. */
export async function createSitesTestStore(options: { register?: boolean } = {}): Promise<SitesTestStore> {
  const miniflare = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
    compatibilityDate: "2026-05-15",
    d1Databases: ["DB"],
    r2Buckets: ["BUCKET"],
  }));
  const database = (await miniflare.getD1Database("DB")) as unknown as D1Database;
  const media = (await miniflare.getR2Bucket("BUCKET")) as unknown as R2Bucket;
  for (const migration of readSitesMigrations()) {
    for (const statement of migration.statements) {
      try {
        await database.prepare(statement).run();
      } catch (error) {
        throw new Error(`Migration ${migration.tag} failed on: ${statement.slice(0, 200)}`, { cause: error });
      }
    }
  }
  if (options.register) setSitesBindings({ DB: database, BUCKET: media });
  return {
    database,
    media,
    async dispose() {
      if (options.register) setSitesBindings(null);
      await miniflare.dispose();
    },
  };
}
