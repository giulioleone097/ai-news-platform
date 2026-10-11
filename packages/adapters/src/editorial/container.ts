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
import { D1EditorialRepository, readSitesMediaObject } from "./d1-editorial-repository";
import { MemoryEditorialRepository } from "./memory-editorial-repository";
import { SupabaseEditorialRepository } from "./supabase-editorial-repository";

const globalForAtlasNews = globalThis as typeof globalThis & {
  __atlasnewsMemoryEditorialRepository?: MemoryEditorialRepository;
};
const memoryRepository = globalForAtlasNews.__atlasnewsMemoryEditorialRepository
  ?? new MemoryEditorialRepository();
globalForAtlasNews.__atlasnewsMemoryEditorialRepository = memoryRepository;

/** The Sites repository over the Worker's D1 database and R2 bucket. */
function createSitesRepository(audience: "public" | "editorial", actorAuthorId?: () => Promise<string | null>) {
  const { database, media } = requireSitesBindings();
  return new D1EditorialRepository(database, {
    audience,
    media,
    newsletter: new D1NewsletterSubscriptionRepository(database),
    actorAuthorId,
  });
}

function asRepositories(
  repository: D1EditorialRepository | SupabaseEditorialRepository,
  mode: "sites" | "supabase",
): EditorialRepositories {
  return {
    articles: repository,
    entities: repository,
    newsletter: repository,
    distribution: repository,
    media: repository,
    mode,
  };
}

export function getPublicEditorialRepositories(): EditorialRepositories {
  const mode = getContentMode();
  if (mode === "sites") return asRepositories(createSitesRepository("public"), "sites");
  if (mode === "demo") {
    return {
      articles: memoryRepository,
      entities: memoryRepository,
      newsletter: memoryRepository,
      distribution: memoryRepository,
      media: memoryRepository,
      mode: "demo",
    };
  }

  const client = createPublicSupabaseClient();
  if (!client) {
    throw new Error("ATLASNEWS_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }

  return asRepositories(new SupabaseEditorialRepository(client, { audience: "public" }), "supabase");
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
  if (mode === "sites") return asRepositories(createSitesRepository("editorial", actorAuthorId), "sites");
  if (mode === "demo") {
    if (!isDemoStudioEnabled()) throw new Error("Studio persistence is not configured.");
    return {
      articles: memoryRepository,
      entities: memoryRepository,
      newsletter: memoryRepository,
      distribution: memoryRepository,
      media: memoryRepository,
      mode: "demo",
    };
  }

  const client = await createClient();
  if (!client) {
    throw new Error("ATLASNEWS_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }

  return asRepositories(new SupabaseEditorialRepository(client, { audience: "editorial" }), "supabase");
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
  if (getContentMode() === "sites") return createSitesRepository("editorial", actorAuthorId);
  if (getContentMode() === "demo") {
    if (!isDemoStudioEnabled()) throw new Error("Studio persistence is not configured.");
    return memoryRepository;
  }
  const client = await createClient();
  if (!client) {
    throw new Error("ATLASNEWS_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }
  return new SupabaseEditorialRepository(client, { audience: "editorial" });
}

/** `actorAuthorId` is the signed-in editor's author; without it the configured admin author is used. */
export function getAdminEditorialRepository(actorAuthorId?: string): AdminEditorialRepository {
  if (getContentMode() === "sites") return createSitesRepository("editorial", async () => actorAuthorId ?? null);
  const admin = createAdminSupabaseClient(actorAuthorId);
  if (admin) return new SupabaseEditorialRepository(admin.client, { audience: "editorial", authorId: admin.authorId });

  if (isDemoStudioEnabled()) return memoryRepository;
  throw new Error("Admin MCP persistence is not configured.");
}

/** An uploaded file the site serves at `/media-store/<name>` on Sites; null in the other modes, which store uploads elsewhere. */
export function readUploadedMedia(name: string) {
  const media = getContentMode() === "sites" ? requireSitesBindings().media : null;
  return media ? readSitesMediaObject(media, name) : Promise.resolve(null);
}
