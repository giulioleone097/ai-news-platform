import type { D1Database, R2Bucket } from "./cloudflare";

/** Binding names declared in `apps/web/.openai/hosting.json`; Sites provisions and injects them. */
export const sitesBindingNames = { database: "DB", media: "BUCKET" } as const;

export interface SitesBindings {
  database: D1Database;
  media: R2Bucket | null;
}

const globalForSites = globalThis as typeof globalThis & { __atlasnewsSitesBindings?: SitesBindings };

/**
 * Called by the Worker entry with its `env` before each request, and by tests with Miniflare bindings.
 * A Worker's bindings are the same objects for every request of an isolate, so a module-level slot is
 * enough; nothing request-specific is stored here.
 */
export function setSitesBindings(env: unknown) {
  const record = (env ?? {}) as Record<string, unknown>;
  const database = record[sitesBindingNames.database] as D1Database | undefined;
  if (!database) {
    globalForSites.__atlasnewsSitesBindings = undefined;
    return;
  }
  globalForSites.__atlasnewsSitesBindings = {
    database,
    media: (record[sitesBindingNames.media] as R2Bucket | undefined) ?? null,
  };
}

export function getSitesBindings(): SitesBindings | null {
  return globalForSites.__atlasnewsSitesBindings ?? null;
}

export function requireSitesBindings(): SitesBindings {
  const bindings = getSitesBindings();
  if (!bindings) {
    throw new Error(
      `ATLASNEWS_CONTENT_MODE=sites needs the D1 binding "${sitesBindingNames.database}" (declared as "d1" in .openai/hosting.json).`,
    );
  }
  return bindings;
}
