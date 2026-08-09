import "server-only";

import type { EditorialRepositories } from "../domain/article-repository";
import { isDemoStudioEnabled } from "@/config/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MemoryEditorialRepository } from "./memory-editorial-repository";
import { SupabaseEditorialRepository } from "./supabase-editorial-repository";

const memoryRepository = new MemoryEditorialRepository();

export function getPublicEditorialRepositories(): EditorialRepositories {
  const client = createPublicSupabaseClient();
  if (!client) {
    return {
      articles: memoryRepository,
      newsletter: memoryRepository,
      mode: "demo",
    };
  }

  const repository = new SupabaseEditorialRepository(client);
  return { articles: repository, newsletter: repository, mode: "supabase" };
}

export async function getStudioEditorialRepositories(): Promise<EditorialRepositories> {
  const client = await createServerSupabaseClient();
  if (!client) {
    if (!isDemoStudioEnabled()) {
      throw new Error("Studio persistence is not configured.");
    }

    return {
      articles: memoryRepository,
      newsletter: memoryRepository,
      mode: "demo",
    };
  }

  const repository = new SupabaseEditorialRepository(client);
  return { articles: repository, newsletter: repository, mode: "supabase" };
}

export function getAdminArticleRepository() {
  const admin = createAdminSupabaseClient();
  if (admin) return new SupabaseEditorialRepository(admin.client, admin.authorId);

  if (isDemoStudioEnabled()) return memoryRepository;
  throw new Error("Admin MCP persistence is not configured.");
}
