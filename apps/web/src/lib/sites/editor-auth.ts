import "server-only";

import { headers } from "next/headers";
import { requireSitesBindings } from "@atlasnews/adapters/sites/bindings";
import { getEditorAllowList, readSitesIdentity, resolveSitesEditor } from "@atlasnews/adapters/sites/editors";
import type { EditorIdentity } from "@/lib/editor-identity";

/** The ChatGPT account signed in to this Site, from the identity headers the platform injects. */
export async function getSitesUser() {
  return readSitesIdentity(await headers());
}

/**
 * The editor profile of a signed-in account (ChatGPT, Google or GitHub, matched by its verified email),
 * or null for a reader.
 */
export async function getSitesEditor(
  account: { userId: string; email: string; name: string | null },
): Promise<EditorIdentity | null> {
  const editor = await resolveSitesEditor(
    requireSitesBindings().database,
    { userId: account.userId, email: account.email, fullName: account.name },
    getEditorAllowList(),
  );
  return editor ? { userId: editor.userId, role: editor.role, author: editor.author, isDemo: false } : null;
}
