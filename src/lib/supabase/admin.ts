import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnvironment } from "@/config/env";

export function createAdminSupabaseClient() {
  const environment = getSupabaseAdminEnvironment();
  if (!environment) return null;

  return {
    authorId: environment.authorId,
    client: createClient(environment.url, environment.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}
