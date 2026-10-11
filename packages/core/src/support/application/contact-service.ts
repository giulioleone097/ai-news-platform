import { createHash, randomUUID } from "node:crypto";
import * as z from "zod/v4";
import {
  contactIdSchema,
  contactPolicy,
  contactMessageInputSchema,
  contactStatusSchema,
  decodeContactCursor,
  type ContactMessage,
  type ContactMessagePage,
  type ContactMessageStatus,
} from "../domain/contact-message";
import type { ContactMessageRepository } from "../domain/ports";

export class ContactMessageError extends Error {
  constructor(readonly code: "invalid_cursor" | "not_found", message: string) {
    super(message);
    this.name = "ContactMessageError";
  }
}

const requesterSchema = z.string().trim().min(1).max(512);

/**
 * The key of a sender's network in the rate-limit tables: a hash, so the table holds no address.
 * ceiling: unsalted, so a leaked table could be brute-forced over the IPv4 space; the buckets only live a day
 * and carry no message. Upgrade trigger: a deployment-wide secret setting that already exists for contact.
 */
export function contactRequesterKey(requester: string) {
  return createHash("sha256").update(`contact:${requesterSchema.parse(requester)}`).digest("hex");
}

export class ContactMessageService {
  constructor(private readonly repository: ContactMessageRepository) {}

  /**
   * Validates and stores a message from the contact form. Throws a `ZodError` for an invalid one. The honeypot
   * is the caller's business; a `website` field in `input` is ignored.
   */
  async submit(input: unknown, context: { requester: string }): Promise<"accepted" | "rate_limited"> {
    const message: ContactMessage = {
      id: randomUUID(),
      ...contactMessageInputSchema.parse(input),
      status: "new",
      createdAt: new Date().toISOString(),
    };
    const outcome = await this.repository.create({ message, requesterKey: contactRequesterKey(context.requester) });
    return outcome === "created" ? "accepted" : "rate_limited";
  }

  async list(input: { status?: ContactMessageStatus; cursor?: string; limit?: number } = {}): Promise<ContactMessagePage> {
    const cursor = decodeContactCursor(input.cursor);
    if (input.cursor && !cursor) throw new ContactMessageError("invalid_cursor", "Invalid contact message cursor.");
    return this.repository.list({
      status: input.status ? contactStatusSchema.parse(input.status) : null,
      cursor,
      limit: Math.min(Math.max(input.limit ?? contactPolicy.pageSize, 1), contactPolicy.maxPageSize),
    });
  }

  /** How many messages still wait for an answer; the dashboard shows it. */
  countNew() {
    return this.repository.count("new");
  }

  async setStatus(id: string, status: ContactMessageStatus) {
    const found = await this.repository.setStatus(contactIdSchema.parse(id), contactStatusSchema.parse(status));
    if (!found) throw new ContactMessageError("not_found", "No contact message has this id.");
  }

  async delete(id: string) {
    const found = await this.repository.delete(contactIdSchema.parse(id));
    if (!found) throw new ContactMessageError("not_found", "No contact message has this id.");
  }
}
