import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CommentOperationError } from "../application/errors";
import type { ModerationActor } from "../domain/comment";

export async function requireCommentModerator(): Promise<ModerationActor> {
  const client = await createServerSupabaseClient();
  if (!client) {
    throw new CommentOperationError(
      "configuration_unavailable",
      "Comment moderation is unavailable.",
      503,
    );
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) {
    throw new CommentOperationError("operation_not_allowed", "Moderator authentication required.", 401);
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile || !["editor", "admin"].includes(String(profile.role))) {
    throw new CommentOperationError("operation_not_allowed", "Moderator permission required.", 403);
  }

  return { kind: "user", userId: authData.user.id, label: null };
}
