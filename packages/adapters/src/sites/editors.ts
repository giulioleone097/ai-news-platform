import type { Author } from "@atlasnews/core/editorial/domain/article";
import { isChatGptSignInEnabled } from "../config/env";
import type { D1Database } from "./cloudflare";

/**
 * A signed-in account with an email its provider vouches for: ChatGPT Sites, or an own Google or GitHub
 * sign-in. Editors are matched by that email, so one person can use any of them.
 *
 * For ChatGPT the platform owns sign-in (`/signin-with-chatgpt`) and injects the `oai-authenticated-*`
 * headers on every request of a signed-in visitor, replacing any the client sent; an anonymous request
 * carries none. They are trusted only in `sites` mode, behind that platform (both callers check the
 * mode), and not at all while `ATLASNEWS_CHATGPT_SIGN_IN=off`.
 */
export interface SitesIdentity {
  /** Stable for one person at one provider: the `oai-authenticated-user-id`, or `google:<sub>` / `github:<id>`. */
  userId: string;
  /** Verified by the provider. */
  email: string;
  fullName: string | null;
}

export function readSitesIdentity(headers: Headers): SitesIdentity | null {
  if (!isChatGptSignInEnabled()) return null;
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

/** A display name for a new author: the account's name, else the part of the email before the @. */
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
 * The editor profile of a signed-in account, or null for a reader. An editor is the row whose email
 * matches the account's verified email (case-insensitively), whichever provider signed them in: ChatGPT,
 * Google or GitHub. An invitation is such a row with no user id yet. An address listed in `adminEmails`
 * or `editorEmails` with no row at all gets that role and a new author at its first sign-in. The user
 * id of the latest sign-in is stored in `editors.user_id` for reference only; it grants nothing.
 * Removing an address from the lists later does not revoke the row it created.
 */
export async function resolveSitesEditor(
  database: D1Database,
  identity: SitesIdentity,
  options: ResolveEditorOptions = {},
): Promise<SitesEditor | null> {
  const select = `SELECT ${editorColumns} FROM editors JOIN authors ON authors.id = editors.author_id`;
  const now = (options.now ?? (() => new Date()))().toISOString();

  const existing = await findByEmail(database, select, identity.email);
  if (existing) return rememberUser(database, existing, identity.userId);

  const email = identity.email.toLowerCase();
  const role: EditorRole | null = listed(options.adminEmails, email)
    ? "admin"
    : listed(options.editorEmails, email) ? "editor" : null;
  if (!role) return null;

  const authorId = crypto.randomUUID();
  const name = authorNameOf(identity);
  // Both inserts are skipped when the email already has a row: another request bootstrapped it first.
  await database.batch([
    database.prepare(
      `INSERT INTO authors (id, name, role, initials, avatar_url, created_at)
       SELECT ?, ?, 'Editor', ?, NULL, ? WHERE NOT EXISTS (SELECT 1 FROM editors WHERE email = ? COLLATE NOCASE)`,
    ).bind(authorId, name, initialsOf(name), now, identity.email),
    database.prepare(
      `INSERT INTO editors (id, email, user_id, author_id, role, created_at, updated_at)
       SELECT ?, ?, NULL, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM editors WHERE email = ? COLLATE NOCASE)`,
    ).bind(crypto.randomUUID(), identity.email, authorId, role, now, now, identity.email),
  ]);
  const created = await findByEmail(database, select, identity.email);
  return created ? rememberUser(database, created, identity.userId) : null;
}

function findByEmail(database: D1Database, select: string, email: string) {
  return database.prepare(`${select} WHERE editors.email = ? COLLATE NOCASE`).bind(email).first<EditorRow>();
}

/**
 * Keeps `user_id` at the latest account seen, written only when it changes. The column is unique, so the
 * write is skipped (not failed) if another editor row already holds that id, for instance after a person
 * changed the email of their Google account.
 */
async function rememberUser(database: D1Database, row: EditorRow, userId: string) {
  if (row.user_id !== userId) {
    await database.prepare(
      `UPDATE editors SET user_id = ?1 WHERE id = ?2
       AND NOT EXISTS (SELECT 1 FROM editors other WHERE other.user_id = ?1 AND other.id <> ?2)`,
    ).bind(userId, row.id).run();
  }
  return toEditor(row, userId);
}

function emailList(value: string | undefined) {
  return (value ?? "").split(",").map((address) => address.trim()).filter((address) => address.includes("@"));
}

/** The accounts `resolveSitesEditor` lets in at their first sign-in (any provider), from the environment. */
export function getEditorAllowList(environment: Record<string, string | undefined> = process.env) {
  return {
    adminEmails: emailList(environment.ATLASNEWS_ADMIN_EMAILS),
    editorEmails: emailList(environment.ATLASNEWS_EDITOR_EMAILS),
  } satisfies ResolveEditorOptions;
}
