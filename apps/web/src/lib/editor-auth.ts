import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n";
import {
  getCurrentEditor,
  hasSignedInUser,
  type EditorIdentity,
} from "@/lib/supabase/editor-auth";

export const getEditorIdentity = cache(getCurrentEditor);
export const isSignedIn = cache(hasSignedInUser);

export async function requireEditor(locale: Locale): Promise<EditorIdentity> {
  const editor = await getEditorIdentity();
  if (!editor) redirect(`/${locale}/login`);
  return editor;
}
