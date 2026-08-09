import "server-only";

import type {
  AdminEditorialRepository,
  EditorialRepositories,
} from "../domain/article-repository";
import { getContentMode, isDemoStudioEnabled } from "@/config/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MemoryEditorialRepository } from "./memory-editorial-repository";
import { SupabaseEditorialRepository } from "./supabase-editorial-repository";

const globalForNeura = globalThis as typeof globalThis & {
  __neuraMemoryEditorialRepository?: MemoryEditorialRepository;
};
const memoryRepository = globalForNeura.__neuraMemoryEditorialRepository
  ?? new MemoryEditorialRepository();
globalForNeura.__neuraMemoryEditorialRepository = memoryRepository;

export function getPublicEditorialRepositories(): EditorialRepositories {
  const mode = getContentMode();
  if (mode === "demo") {
    return {
      articles: memoryRepository,
      newsletter: memoryRepository,
      distribution: memoryRepository,
      media: memoryRepository,
      mode: "demo",
    };
  }

  const client = createPublicSupabaseClient();
  if (!client) {
    throw new Error("NEURA_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }

  const repository = new SupabaseEditorialRepository(client);
  return {
    articles: repository,
    newsletter: repository,
    distribution: repository,
    media: repository,
    mode: "supabase",
  };
}

export async function getStudioEditorialRepositories(): Promise<EditorialRepositories> {
  const mode = getContentMode();
  if (mode === "demo") {
    if (!isDemoStudioEnabled()) throw new Error("Studio persistence is not configured.");
    return {
      articles: memoryRepository,
      newsletter: memoryRepository,
      distribution: memoryRepository,
      media: memoryRepository,
      mode: "demo",
    };
  }

  const client = await createServerSupabaseClient();
  if (!client) {
    throw new Error("NEURA_CONTENT_MODE=supabase requires both public Supabase credentials.");
  }

  const repository = new SupabaseEditorialRepository(client);
  return {
    articles: repository,
    newsletter: repository,
    distribution: repository,
    media: repository,
    mode: "supabase",
  };
}

export function getAdminEditorialRepository(): AdminEditorialRepository {
  const admin = createAdminSupabaseClient();
  if (admin) return new SupabaseEditorialRepository(admin.client, admin.authorId);

  if (isDemoStudioEnabled()) return memoryRepository;
  throw new Error("Admin MCP persistence is not configured.");
}
