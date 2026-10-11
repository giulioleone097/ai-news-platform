import "server-only";

import { isDemoStudioEnabled } from "@atlasnews/adapters/config/env";
import { seedAuthor } from "@atlasnews/adapters/editorial/seed";
import type { SignedInUser } from "@/lib/auth/signed-in-user";
import type { EditorIdentity } from "@/lib/editor-identity";
import { createServerSupabaseClient } from "./server";

function metadataText(metadata: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** The Supabase Auth user signed in, editor or not, and how they signed in (email, Google or GitHub). */
export async function getSupabaseUser(): Promise<SignedInUser | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  const provider = data.user.app_metadata?.provider;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    name: metadataText(data.user.user_metadata, "full_name", "name", "user_name"),
    provider: provider === "google" || provider === "github" ? provider : "email",
  };
}

export async function getCurrentEditor(): Promise<EditorIdentity | null> {
  const client = await createServerSupabaseClient();
  if (!client) {
    if (!isDemoStudioEnabled()) return null;

    return {
      userId: "demo-editor",
      role: "admin",
      author: seedAuthor,
      isDemo: true,
    };
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await client
    .from("profiles")
    .select("role, author:authors(id, name, role, initials, avatar_url)")
    .eq("id", authData.user.id)
    .in("role", ["editor", "admin"])
    .maybeSingle();

  if (error || !data) return null;

  const authorRecord = Array.isArray(data.author) ? data.author[0] : data.author;
  if (!authorRecord) return null;

  return {
    userId: authData.user.id,
    role: data.role as "editor" | "admin",
    author: {
      id: authorRecord.id,
      name: authorRecord.name,
      role: authorRecord.role,
      initials: authorRecord.initials,
      avatarUrl: authorRecord.avatar_url ?? undefined,
    },
    isDemo: false,
  };
}
