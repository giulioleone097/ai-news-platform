import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/config/env";

export function createPublicSupabaseClient() {
  const environment = getSupabaseEnvironment();
  if (!environment) return null;

  return createClient(environment.url, environment.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
