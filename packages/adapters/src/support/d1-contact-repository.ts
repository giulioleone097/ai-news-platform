import {
  contactPolicy,
  toContactPage,
  type ContactMessage,
  type ContactMessageQuery,
  type ContactMessageStatus,
} from "@atlasnews/core/support/domain/contact-message";
import type { ContactMessageRepository } from "@atlasnews/core/support/domain/ports";
import type { Locale } from "@atlasnews/core/locale";
import type { D1Database } from "../sites/cloudflare";

interface MessageRow {
  id: string;
  locale: Locale;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: ContactMessageStatus;
  created_at: string;
}

const columns = "id, locale, name, email, subject, body, status, created_at";
const requesterWindowMs = contactPolicy.requesterWindowMinutes * 60_000;
const siteWindowMs = 3_600_000;
const dayMs = 86_400_000;

/**
 * Counts a request in the fixed window that starts at `?2`; a counter from an earlier window restarts at 1.
 * `scope` is the counter's key as SQL (`?1` for a requester, `'global'` for the site) and `condition` gates it.
 */
const countRequest = (scope: string, condition: string) => `
  INSERT INTO contact_request_limits (scope_key, window_started_at, request_count, updated_at)
  SELECT ${scope}, ?2, 1, ?3 WHERE ${condition}
  ON CONFLICT (scope_key) DO UPDATE SET
    request_count = CASE WHEN window_started_at = excluded.window_started_at THEN request_count + 1 ELSE 1 END,
    window_started_at = excluded.window_started_at,
    updated_at = excluded.updated_at`;

const counter = (key: string) => `(SELECT request_count FROM contact_request_limits WHERE scope_key = ${key})`;

const marks = (count: number) => Array.from({ length: count }, () => "?").join(", ");

function toMessage(row: MessageRow): ContactMessage {
  return {
    id: row.id,
    locale: row.locale,
    name: row.name,
    email: row.email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** The contact inbox on the Site's D1 database. D1 has no RLS: the delivery layer only hands this out to the form and to editors. */
export class D1ContactMessageRepository implements ContactMessageRepository {
  constructor(private readonly database: D1Database) {}

  async create({ message, requesterKey }: { message: ContactMessage; requesterKey: string }) {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const requesterWindow = new Date(Math.floor(nowMs / requesterWindowMs) * requesterWindowMs).toISOString();
    const siteWindow = new Date(Math.floor(nowMs / siteWindowMs) * siteWindowMs).toISOString();
    const withinRequester = `${counter("?1")} <= ${contactPolicy.requesterLimit}`;

    // One batch: count the sender, count the site while the sender is within its limit, and store the message
    // only while both are. A rejected sender still counts, so hammering the form keeps it rejected.
    const results = await this.database.batch([
      this.database
        .prepare(
          `DELETE FROM contact_request_limits WHERE scope_key IN (
             SELECT scope_key FROM contact_request_limits
             WHERE scope_key <> 'global' AND updated_at < ?1 ORDER BY updated_at LIMIT 16)`,
        )
        .bind(new Date(nowMs - dayMs).toISOString()),
      this.database.prepare(countRequest("?1", "true")).bind(requesterKey, requesterWindow, now),
      this.database.prepare(countRequest("'global'", withinRequester)).bind(requesterKey, siteWindow, now),
      this.database
        .prepare(
          `INSERT INTO contact_messages (id, locale, name, email, subject, body, status, created_at)
           SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
           WHERE ${withinRequester} AND ${counter("'global'")} <= ${contactPolicy.siteLimit}`,
        )
        .bind(
          requesterKey,
          message.id,
          message.locale,
          message.name,
          message.email,
          message.subject,
          message.body,
          message.status,
          message.createdAt,
        ),
    ]);
    return results[3].meta.changes > 0 ? "created" : "rate_limited";
  }

  async list(query: ContactMessageQuery) {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (query.status) {
      filters.push("status = ?");
      values.push(query.status);
    }
    if (query.cursor) {
      filters.push("(created_at < ? OR (created_at = ? AND id < ?))");
      values.push(query.cursor.createdAt, query.cursor.createdAt, query.cursor.id);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { results } = await this.database
      .prepare(`SELECT ${columns} FROM contact_messages ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
      .bind(...values, query.limit + 1)
      .all<MessageRow>();
    return toContactPage(results.map(toMessage), query.limit);
  }

  async count(status: ContactMessageStatus) {
    const row = await this.database
      .prepare("SELECT count(*) AS total FROM contact_messages WHERE status = ?1")
      .bind(status)
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  async findMany(ids: string[]) {
    if (!ids.length) return [];
    const { results } = await this.database
      .prepare(`SELECT ${columns} FROM contact_messages WHERE id IN (${marks(ids.length)})`)
      .bind(...ids)
      .all<MessageRow>();
    return results.map(toMessage);
  }

  async setStatus(id: string, status: ContactMessageStatus) {
    const result = await this.database
      .prepare("UPDATE contact_messages SET status = ?2 WHERE id = ?1")
      .bind(id, status)
      .run();
    return result.meta.changes > 0;
  }

  /** One UPDATE, so every message changes or none does. */
  async setStatusMany(ids: string[], status: ContactMessageStatus) {
    if (!ids.length) return;
    await this.database
      .prepare(`UPDATE contact_messages SET status = ? WHERE id IN (${marks(ids.length)})`)
      .bind(status, ...ids)
      .run();
  }

  async delete(id: string) {
    const result = await this.database.prepare("DELETE FROM contact_messages WHERE id = ?1").bind(id).run();
    return result.meta.changes > 0;
  }

  async deleteMany(ids: string[]) {
    if (!ids.length) return;
    await this.database.prepare(`DELETE FROM contact_messages WHERE id IN (${marks(ids.length)})`).bind(...ids).run();
  }
}
