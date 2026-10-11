import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getContentMode } from "@atlasnews/adapters/config/env";
import type { Locale } from "@/i18n";
import { getOwnSessionUser } from "@/lib/auth/own-session";
import type { SignedInUser } from "@/lib/auth/signed-in-user";
import type { EditorIdentity } from "@/lib/editor-identity";
import { getSitesEditor, getSitesUser } from "@/lib/sites/editor-auth";
import { getCurrentEditor, getSupabaseUser } from "@/lib/supabase/editor-auth";

// Who is signed in comes from the first of these that knows: ChatGPT (the platform's identity headers,
// `sites` only), our own Google or GitHub session cookie (`sites` and `demo`), Supabase Auth (`supabase`,
// which also handles its Google and GitHub sign-ins). Every caller goes through these functions, so no
// screen or action depends on how the person signed in.

/** The person signed in, editor or not; null for an anonymous visitor. */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => {
  const mode = getContentMode();
  if (mode === "supabase") return getSupabaseUser();

  if (mode === "sites") {
    const chatgpt = await getSitesUser();
    if (chatgpt) return { userId: chatgpt.userId, email: chatgpt.email, name: chatgpt.fullName, provider: "chatgpt" };
  }
  return getOwnSessionUser();
});

/**
 * The Studio editor. On Sites the editor is found by the verified email of whoever is signed in, so one
 * person can use ChatGPT, Google and GitHub interchangeably.
 */
export const getEditorIdentity = cache(async (): Promise<EditorIdentity | null> => {
  if (getContentMode() !== "sites") return getCurrentEditor();
  const user = await getSignedInUser();
  return user?.email ? getSitesEditor({ userId: user.userId, email: user.email, name: user.name }) : null;
});

/** The id of whoever is signed in, editor or not; null for an anonymous visitor. */
export const getSignedInUserId = cache(async (): Promise<string | null> => (await getSignedInUser())?.userId ?? null);

/** Whether anybody is signed in, editor or not: tells "sign in" (401) from "not an editor" (403). */
export const isSignedIn = cache(async () => Boolean(await getSignedInUser()));

export async function requireEditor(locale: Locale): Promise<EditorIdentity> {
  const editor = await getEditorIdentity();
  if (!editor) redirect(`/${locale}/login`);
  return editor;
}
