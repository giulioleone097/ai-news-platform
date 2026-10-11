import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getContentMode, getSupabaseEnvironment } from "@atlasnews/adapters/config/env";

/** The session-bound Supabase client; null on Sites, where the platform signs people in, and without Supabase. */
export async function createServerSupabaseClient() {
  const environment = getContentMode() === "sites" ? null : getSupabaseEnvironment();
  if (!environment) return null;

  const cookieStore = await cookies();

  return createServerClient(environment.url, environment.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes them.
        }
      },
    },
  });
}
