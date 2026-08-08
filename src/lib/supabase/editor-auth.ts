import "server-only";

import type { Author } from "@/modules/editorial/domain/article";
import { seedAuthor } from "@/modules/editorial/infrastructure/seed";
import { createServerSupabaseClient } from "./server";

export interface EditorIdentity {
  userId: string;
  role: "editor" | "admin";
  author: Author;
  isDemo: boolean;
}

export async function getCurrentEditor(): Promise<EditorIdentity | null> {
  const client = await createServerSupabaseClient();
  if (!client) {
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
