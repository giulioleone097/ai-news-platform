import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getContentMode } from "@atlasnews/adapters/config/env";
import type { Locale } from "@/i18n";
import type { EditorIdentity } from "@/lib/editor-identity";
import { getSitesEditor, getSitesUser } from "@/lib/sites/editor-auth";
import { getCurrentEditor, getSignedInUserId as getSupabaseUserId } from "@/lib/supabase/editor-auth";

// On ChatGPT Sites the platform signs people in with ChatGPT; with Supabase, Supabase Auth does. Every
// caller goes through these three functions, so no screen or action depends on the backend.

export const getEditorIdentity = cache((): Promise<EditorIdentity | null> =>
  getContentMode() === "sites" ? getSitesEditor() : getCurrentEditor());

/** The id of whoever is signed in, editor or not; null for an anonymous visitor. */
export const getSignedInUserId = cache(async (): Promise<string | null> =>
  getContentMode() === "sites" ? (await getSitesUser())?.userId ?? null : getSupabaseUserId());

/** Whether anybody is signed in, editor or not: tells "sign in" (401) from "not an editor" (403). */
export const isSignedIn = cache(async () => Boolean(await getSignedInUserId()));

export async function requireEditor(locale: Locale): Promise<EditorIdentity> {
  const editor = await getEditorIdentity();
  if (!editor) redirect(`/${locale}/login`);
  return editor;
}
