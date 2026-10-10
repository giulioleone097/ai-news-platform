import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminEditorialRepository,
  EditorialRepositories,
} from "@atlasnews/core/editorial/domain/article-repository";
import { getContentMode, isDemoStudioEnabled } from "../config/env";
import { createAdminSupabaseClient } from "../supabase/admin";
import { createPublicSupabaseClient } from "../supabase/public";
import { MemoryEditorialRepository } from "./memory-editorial-repository";
import { SupabaseEditorialRepository } from "./supabase-editorial-repository";

const globalForAtlasNews = globalThis as typeof globalThis & {
  __atlasnewsMemoryEditorialRepository?: MemoryEditorialRepository;
};
const memoryRepository = globalForAtlasNews.__atlasnewsMemoryEditorialRepository
  ?? new MemoryEditorialRepository();
globalForAtlasNews.__atlasnewsMemoryEditorialRepository = memoryRepository;

export function getPublicEditorialRepositories(): EditorialRepositories {
  const mode = getContentMode();
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

  const repository = new SupabaseEditorialRepository(client, { audience: "public" });
  return {
    articles: repository,
    entities: repository,
    newsletter: repository,
    distribution: repository,
    media: repository,
    mode: "supabase",
  };
}

/** `createClient` supplies the session-bound Supabase client, which only the delivery app can build. */
export async function getStudioEditorialRepositories(
  createClient: () => Promise<SupabaseClient | null>,
): Promise<EditorialRepositories> {
  const mode = getContentMode();
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

  const repository = new SupabaseEditorialRepository(client, { audience: "editorial" });
  return {
    articles: repository,
    entities: repository,
    newsletter: repository,
    distribution: repository,
    media: repository,
    mode: "supabase",
  };
}

/**
 * The Studio's session-bound repository with every editorial port, including the category and entity
 * write ports and the batch writes that `EditorialRepositories` does not carry. RLS applies.
 */
export async function getStudioAdminEditorialRepository(
  createClient: () => Promise<SupabaseClient | null>,
): Promise<AdminEditorialRepository> {
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
  const admin = createAdminSupabaseClient(actorAuthorId);
  if (admin) return new SupabaseEditorialRepository(admin.client, { audience: "editorial", authorId: admin.authorId });

  if (isDemoStudioEnabled()) return memoryRepository;
  throw new Error("Admin MCP persistence is not configured.");
}
