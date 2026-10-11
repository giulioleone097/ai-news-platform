import type { Author } from "@atlasnews/core/editorial/domain/article";
import type { D1Database } from "./cloudflare";

/**
 * Who is signed in, as ChatGPT Sites reports it. The platform owns sign-in (`/signin-with-chatgpt`)
 * and injects these headers on every request of a signed-in visitor, replacing any the client sent;
 * an anonymous request carries none. They are trusted only in `sites` mode, behind that platform.
 */
export interface SitesIdentity {
  /** `oai-authenticated-user-id`: stable for one person on this Site. */
  userId: string;
  email: string;
  fullName: string | null;
}

export function readSitesIdentity(headers: Headers): SitesIdentity | null {
  const userId = headers.get("oai-authenticated-user-id")?.trim();
  const email = headers.get("oai-authenticated-user-email")?.trim();
  if (!userId || !email) return null;
  const encodedName = headers.get("oai-authenticated-user-full-name");
  let fullName: string | null = null;
  if (encodedName && headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try {
      fullName = decodeURIComponent(encodedName).trim() || null;
    } catch {
      fullName = null;
    }
  }
  return { userId, email, fullName };
}

export type EditorRole = "editor" | "admin";

export interface SitesEditor {
  userId: string;
  email: string;
  role: EditorRole;
  author: Author;
}

interface EditorRow {
  id: string;
  user_id: string | null;
  email: string;
  role: EditorRole;
  author_id: string;
  author_name: string;
  author_role: string;
  author_initials: string;
  author_avatar_url: string | null;
}

const editorColumns = `editors.id, editors.user_id, editors.email, editors.role, editors.author_id,
  authors.name AS author_name, authors.role AS author_role, authors.initials AS author_initials,
  authors.avatar_url AS author_avatar_url`;

function toEditor(row: EditorRow, userId: string): SitesEditor {
  return {
    userId,
    email: row.email,
    role: row.role,
    author: {
      id: row.author_id,
      name: row.author_name,
      role: row.author_role,
      initials: row.author_initials,
      avatarUrl: row.author_avatar_url ?? undefined,
    },
  };
}

/** Up to four initials from a display name, as the `authors.initials` check allows. */
function initialsOf(name: string) {
  const letters = name.split(/[\s._-]+/).filter(Boolean).map((part) => part[0]!.toUpperCase());
  return letters.join("").slice(0, 2) || "ED";
}

/** A display name for a new author: the ChatGPT name, else the part of the email before the @. */
function authorNameOf(identity: SitesIdentity) {
  const name = (identity.fullName ?? identity.email.split("@")[0] ?? "").trim().slice(0, 120);
  return name.length >= 2 ? name : "Editor";
}

export interface ResolveEditorOptions {
  /** `ATLASNEWS_ADMIN_EMAILS`: these accounts become admins at their first sign-in. */
  adminEmails?: readonly string[];
  /** `ATLASNEWS_EDITOR_EMAILS`: these accounts become editors at their first sign-in. */
  editorEmails?: readonly string[];
  now?: () => Date;
}

function listed(addresses: readonly string[] | undefined, email: string) {
  return Boolean(addresses?.some((address) => address.trim().toLowerCase() === email));
}

/**
 * The editor profile of a signed-in ChatGPT account, or null for a reader. An editor is found by their
 * Sites user id; an invitation (a row with the email and no user id yet) is claimed at the first
 * sign-in; an address listed in `adminEmails` or `editorEmails` with no row at all gets that role and a
 * new author. An invitation or a listed address already bound to another user id grants nothing.
 * Removing an address from the lists later does not revoke the row it created.
 */
export async function resolveSitesEditor(
  database: D1Database,
  identity: SitesIdentity,
  options: ResolveEditorOptions = {},
): Promise<SitesEditor | null> {
  const select = `SELECT ${editorColumns} FROM editors JOIN authors ON authors.id = editors.author_id`;
  const bound = await database.prepare(`${select} WHERE editors.user_id = ?`).bind(identity.userId).first<EditorRow>();
  if (bound) return toEditor(bound, identity.userId);

  const now = (options.now ?? (() => new Date()))().toISOString();
  const invited = await database.prepare(`${select} WHERE editors.email = ? AND editors.user_id IS NULL`)
    .bind(identity.email)
    .first<EditorRow>();
  if (invited) {
    const claimed = await database.prepare(
      "UPDATE editors SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL RETURNING id",
    ).bind(identity.userId, now, invited.id).first();
    // Another request bound it first; it is that request's user, so look again by user id.
    return claimed ? toEditor(invited, identity.userId) : resolveBound(database, select, identity.userId);
  }

  const email = identity.email.toLowerCase();
  const role: EditorRole | null = listed(options.adminEmails, email)
    ? "admin"
    : listed(options.editorEmails, email) ? "editor" : null;
  if (!role) return null;

  const authorId = crypto.randomUUID();
  const name = authorNameOf(identity);
  // Both inserts are skipped when the email already has a row: another request bootstrapped it, or an
  // invitation for it is bound to someone else.
  await database.batch([
    database.prepare(
      `INSERT INTO authors (id, name, role, initials, avatar_url, created_at)
       SELECT ?, ?, 'Editor', ?, NULL, ? WHERE NOT EXISTS (SELECT 1 FROM editors WHERE email = ?)`,
    ).bind(authorId, name, initialsOf(name), now, identity.email),
    database.prepare(
      `INSERT INTO editors (id, email, user_id, author_id, role, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM editors WHERE email = ?)`,
    ).bind(crypto.randomUUID(), identity.email, identity.userId, authorId, role, now, now, identity.email),
  ]);
  return resolveBound(database, select, identity.userId);
}

async function resolveBound(database: D1Database, select: string, userId: string) {
  const row = await database.prepare(`${select} WHERE editors.user_id = ?`).bind(userId).first<EditorRow>();
  return row ? toEditor(row, userId) : null;
}

function emailList(value: string | undefined) {
  return (value ?? "").split(",").map((address) => address.trim()).filter((address) => address.includes("@"));
}

/** The accounts `resolveSitesEditor` lets in at their first sign-in, from the environment. */
export function getEditorAllowList(environment: Record<string, string | undefined> = process.env) {
  return {
    adminEmails: emailList(environment.ATLASNEWS_ADMIN_EMAILS),
    editorEmails: emailList(environment.ATLASNEWS_EDITOR_EMAILS),
  } satisfies ResolveEditorOptions;
}
