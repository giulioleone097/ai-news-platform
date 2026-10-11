import * as z from "zod/v4";

import { contactMessageStatuses, contactPolicy } from "@atlasnews/core/support/domain/contact-message";

import { destructive, readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import { contentTrustSchema, untrustedDescription } from "../untrusted";

const idSchema = z.string().uuid();
const statusSchema = z.enum(contactMessageStatuses);
const unavailable = "The contact inbox is not configured or the request could not be completed.";

const messageSchema = z.object({
  id: z.string(),
  locale: z.enum(["en", "it"]),
  name: z.string(),
  email: z.string(),
  subject: z.string(),
  body: z.string(),
  status: statusSchema,
  createdAt: z.string(),
});

const base = { surfaces: ["mcp", "page"], unavailableMessage: unavailable } as const;

export const adminListContactMessages = defineSpec({
  ...base,
  name: "admin_list_contact_messages",
  title: "List contact messages",
  description:
    "List messages that visitors sent through the contact form, newest first, optionally only one status "
    + "(new, handled or archived). Pass the returned nextCursor to read the next page. Results contain personal data and require an editor sign-in."
    + untrustedDescription,
  input: z.object({
    status: statusSchema.optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.number().int().min(1).max(contactPolicy.maxPageSize).default(contactPolicy.pageSize),
  }),
  output: z.object({
    items: z.array(messageSchema),
    nextCursor: z.string().nullable(),
    contentTrust: contentTrustSchema,
  }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminUpdateContactMessage = defineSpec({
  ...base,
  name: "admin_update_contact_message",
  title: "Update contact message status",
  description:
    "Mark one contact message new, handled or archived. This only records the editors' progress; it sends no reply.",
  input: z.object({ id: idSchema, status: statusSchema }),
  output: z.object({ id: z.string(), status: statusSchema }),
  annotations: { ...write, idempotentHint: true },
  scopes: ["newsroom.write"],
});

export const adminDeleteContactMessage = defineSpec({
  ...base,
  name: "admin_delete_contact_message",
  title: "Delete contact message",
  description: "Permanently delete one contact message. Archive it instead when it may be needed later.",
  input: z.object({ id: idSchema }),
  output: z.object({ deletedId: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Permanently delete contact message ${id}?` },
});

export const supportSpecs = [adminListContactMessages, adminUpdateContactMessage, adminDeleteContactMessage] as const;
