import "server-only";

import { headers } from "next/headers";
import { requireSitesBindings } from "@atlasnews/adapters/sites/bindings";
import { getEditorAllowList, readSitesIdentity, resolveSitesEditor } from "@atlasnews/adapters/sites/editors";
import type { EditorIdentity } from "@/lib/editor-identity";

/** The ChatGPT account signed in to this Site, from the identity headers the platform injects. */
export async function getSitesUser() {
  return readSitesIdentity(await headers());
}

/** The signed-in ChatGPT account's editor profile, or null for a reader or an anonymous visitor. */
export async function getSitesEditor(): Promise<EditorIdentity | null> {
  const identity = await getSitesUser();
  if (!identity) return null;
  const editor = await resolveSitesEditor(requireSitesBindings().database, identity, getEditorAllowList());
  return editor ? { userId: editor.userId, role: editor.role, author: editor.author, isDemo: false } : null;
}

const reservedPaths = new Set(["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"]);

/** A same-origin path to come back to; anything else, or a platform auth path, becomes `/`. */
function safeReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://site.invalid");
    if (url.origin !== "https://site.invalid" || reservedPaths.has(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Sign-in and sign-out belong to the platform. They must start as a top-level navigation (a plain
 * link or form with `target="_top"`), never a fetch or a client-side route change.
 */
export function chatGPTSignInPath(returnTo: string) {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo: string) {
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}
