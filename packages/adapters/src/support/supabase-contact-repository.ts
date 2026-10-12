import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod/v4";
import { locales } from "@atlasnews/core/locale";
import {
  contactMessageStatuses,
  toContactPage,
  type ContactMessage,
  type ContactMessageQuery,
  type ContactMessageStatus,
} from "@atlasnews/core/support/domain/contact-message";
import type { ContactMessageRepository } from "@atlasnews/core/support/domain/ports";

const columns = "id, locale, name, email, subject, body, status, created_at";

const rowSchema = z.object({
  id: z.string(),
  locale: z.enum(locales),
  name: z.string(),
  email: z.string(),
  subject: z.string(),
  body: z.string(),
  status: z.enum(contactMessageStatuses),
  created_at: z.string(),
});

function throwIfError(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function toMessage(row: z.output<typeof rowSchema>): ContactMessage {
  return {
    id: row.id,
    locale: row.locale,
    name: row.name,
    email: row.email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    // Postgres prints +00:00 and may keep microseconds; the cursor and the other adapters use UTC milliseconds.
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * The contact inbox on Supabase, through the service-role client. Messages come in only through
 * `submit_contact_message()` (20261015100000_contact_messages.sql), which also applies the rate limits.
 */
export class SupabaseContactMessageRepository implements ContactMessageRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create({ message, requesterKey }: { message: ContactMessage; requesterKey: string }) {
    const { data, error } = await this.client.rpc("submit_contact_message", {
      p_id: message.id,
      p_locale: message.locale,
      p_name: message.name,
      p_email: message.email,
      p_subject: message.subject,
      p_body: message.body,
      p_request_fingerprint: requesterKey,
    });
    throwIfError(error, "Unable to store the contact message");
    return z.enum(["created", "rate_limited"]).parse(data);
  }

  async list(query: ContactMessageQuery) {
    let request = this.client.from("contact_messages").select(columns);
    if (query.status) request = request.eq("status", query.status);
    // The cursor was validated as an ISO timestamp and a UUID, so it holds nothing the filter syntax reads.
    if (query.cursor) {
      const { createdAt, id } = query.cursor;
      request = request.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    }
    const { data, error } = await request
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(query.limit + 1);
    throwIfError(error, "Unable to list contact messages");
    return toContactPage(z.array(rowSchema).parse(data ?? []).map(toMessage), query.limit);
  }

  async count(status: ContactMessageStatus) {
    const { count, error } = await this.client
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    throwIfError(error, "Unable to count contact messages");
    return count ?? 0;
  }

  async findMany(ids: string[]) {
    const { data, error } = await this.client.from("contact_messages").select(columns).in("id", ids);
    throwIfError(error, "Unable to load contact messages");
    return z.array(rowSchema).parse(data ?? []).map(toMessage);
  }

  async setStatus(id: string, status: ContactMessageStatus) {
    const { data, error } = await this.client.from("contact_messages").update({ status }).eq("id", id).select("id");
    throwIfError(error, "Unable to update the contact message");
    return (data?.length ?? 0) > 0;
  }

  /** One UPDATE statement, so every message changes or none does. */
  async setStatusMany(ids: string[], status: ContactMessageStatus) {
    const { error } = await this.client.from("contact_messages").update({ status }).in("id", ids);
    throwIfError(error, "Unable to update the contact messages");
  }

  async delete(id: string) {
    const { data, error } = await this.client.from("contact_messages").delete().eq("id", id).select("id");
    throwIfError(error, "Unable to delete the contact message");
    return (data?.length ?? 0) > 0;
  }

  async deleteMany(ids: string[]) {
    const { error } = await this.client.from("contact_messages").delete().in("id", ids);
    throwIfError(error, "Unable to delete the contact messages");
  }
}
