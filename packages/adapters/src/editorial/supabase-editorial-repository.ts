import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminEditorialRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { composeAdminEditorialRepository, type EditorialParts } from "./compose";
import { SupabaseArticleRepository } from "./supabase/articles";
import { SupabaseCategoryAdminRepository } from "./supabase/categories";
import { SupabaseDistributionRepository } from "./supabase/distribution";
import { SupabaseEntityRepository } from "./supabase/entities";
import { SupabaseEntityAdminRepository } from "./supabase/entity-admin";
import { SupabaseMediaRepository } from "./supabase/media";
import { SupabaseNewsletterRepository } from "./supabase/newsletter";
import type { EditorialRepositoryOptions } from "./supabase/shared";

export type { EditorialRepositoryOptions } from "./supabase/shared";

/** The editorial content on Supabase (Postgres, Storage), one class per port in `./supabase`. RLS decides what each client may do. */
export function createSupabaseEditorialParts(client: SupabaseClient, options: EditorialRepositoryOptions): EditorialParts {
  return {
    articles: new SupabaseArticleRepository(client, options),
    categories: new SupabaseCategoryAdminRepository(client),
    entities: new SupabaseEntityRepository(client),
    entityAdmin: new SupabaseEntityAdminRepository(client),
    newsletter: new SupabaseNewsletterRepository(client),
    distribution: new SupabaseDistributionRepository(client),
    media: new SupabaseMediaRepository(client),
  };
}

export function createSupabaseEditorialRepository(
  client: SupabaseClient,
  options: EditorialRepositoryOptions,
): AdminEditorialRepository {
  return composeAdminEditorialRepository(createSupabaseEditorialParts(client, options));
}
