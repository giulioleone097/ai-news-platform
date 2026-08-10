import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceEnvironment } from "@/config/env";

export function createServiceSupabaseClient() {
  const environment = getSupabaseServiceEnvironment();
  if (!environment) return null;

  return createClient(environment.url, environment.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
