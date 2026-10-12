import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminEditorialRepository,
  EditorialRepositories,
} from "@atlasnews/core/editorial/domain/article-repository";
import { getContentMode, isDemoStudioEnabled } from "../config/env";
import { D1NewsletterSubscriptionRepository } from "../newsletter/d1-newsletter-subscriptions";
import { requireSitesBindings } from "../sites/bindings";
import { createAdminSupabaseClient } from "../supabase/admin";
import { createPublicSupabaseClient } from "../supabase/public";
import { composeAdminEditorialRepository, toEditorialRepositories, type EditorialParts } from "./compose";
import { createD1EditorialParts, readSitesMediaObject } from "./d1-editorial-repository";
import { createMemoryEditorialParts } from "./memory-editorial-repository";
import { MemoryEditorialStore } from "./memory/store";
import { createSupabaseEditorialParts } from "./supabase-editorial-repository";

// The demo content is one store for the whole process, so every request sees the edits of the previous one.
const globalForAtlasNews = globalThis as typeof globalThis & {
  __atlasnewsMemoryEditorialStore?: MemoryEditorialStore;
};
const memoryStore = globalForAtlasNews.__atlasnewsMemoryEditorialStore ?? new MemoryEditorialStore();
globalForAtlasNews.__atlasnewsMemoryEditorialStore = memoryStore;
const memoryParts = createMemoryEditorialParts(memoryStore);
const memoryRepository = composeAdminEditorialRepository(memoryParts);

/** The Sites ports over the Worker's D1 database and R2 bucket. */
function createSitesParts(audience: "public" | "editorial", actorAuthorId?: () => Promise<string | null>): EditorialParts {
  const { database, media } = requireSitesBindings();
  return createD1EditorialParts(database, {
    audience,
    media,
    newsletter: new D1NewsletterSubscriptionRepository(database),
    actorAuthorId,
  });
}

export function getPublicEditorialRepositories(): EditorialRepositories {
  const mode = getContentMode();
  if (mode === "sites") return toEditorialRepositories(createSitesParts("public"), "sites");
  if (mode === "demo") return toEditorialRepositories(memoryParts, "demo");

  const client = createPublicSupabaseClient();
  if (!client) {
    throw new Error("ATLASNEWS_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }

  return toEditorialRepositories(createSupabaseEditorialParts(client, { audience: "public" }), "supabase");
}

/**
 * `createClient` supplies the session-bound Supabase client, which only the delivery app can build.
 * `actorAuthorId` is the signed-in editor's author on Sites, where there is no Supabase session.
 */
export async function getStudioEditorialRepositories(
  createClient: () => Promise<SupabaseClient | null>,
  actorAuthorId?: () => Promise<string | null>,
): Promise<EditorialRepositories> {
  const mode = getContentMode();
  if (mode === "sites") return toEditorialRepositories(createSitesParts("editorial", actorAuthorId), "sites");
  if (mode === "demo") {
    if (!isDemoStudioEnabled()) throw new Error("Studio persistence is not configured.");
    return toEditorialRepositories(memoryParts, "demo");
  }

  const client = await createClient();
  if (!client) {
    throw new Error("ATLASNEWS_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }

  return toEditorialRepositories(createSupabaseEditorialParts(client, { audience: "editorial" }), "supabase");
}

/**
 * The Studio's session-bound repository with every editorial port, including the category and entity
 * write ports and the batch writes that `EditorialRepositories` does not carry. RLS applies.
 * `actorAuthorId` is only used on Sites (see `getStudioEditorialRepositories`).
 */
export async function getStudioAdminEditorialRepository(
  createClient: () => Promise<SupabaseClient | null>,
  actorAuthorId?: () => Promise<string | null>,
): Promise<AdminEditorialRepository> {
  if (getContentMode() === "sites") return composeAdminEditorialRepository(createSitesParts("editorial", actorAuthorId));
  if (getContentMode() === "demo") {
    if (!isDemoStudioEnabled()) throw new Error("Studio persistence is not configured.");
    return memoryRepository;
  }
  const client = await createClient();
  if (!client) {
    throw new Error("ATLASNEWS_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }
  return composeAdminEditorialRepository(createSupabaseEditorialParts(client, { audience: "editorial" }));
}

/** `actorAuthorId` is the signed-in editor's author; without it the configured admin author is used. */
export function getAdminEditorialRepository(actorAuthorId?: string): AdminEditorialRepository {
  if (getContentMode() === "sites") return composeAdminEditorialRepository(createSitesParts("editorial", async () => actorAuthorId ?? null));
  const admin = createAdminSupabaseClient(actorAuthorId);
  if (admin) {
    return composeAdminEditorialRepository(
      createSupabaseEditorialParts(admin.client, { audience: "editorial", authorId: admin.authorId }),
    );
  }

  if (isDemoStudioEnabled()) return memoryRepository;
  throw new Error("Admin MCP persistence is not configured.");
}

/** An uploaded file the site serves at `/media-store/<name>` on Sites; null in the other modes, which store uploads elsewhere. */
export function readUploadedMedia(name: string) {
  const media = getContentMode() === "sites" ? requireSitesBindings().media : null;
  return media ? readSitesMediaObject(media, name) : Promise.resolve(null);
}
