import * as z from "zod/v4";
import { locales, type Locale } from "../../locale";
import { contactPolicy } from "./policy";

export { contactPolicy };

export const contactMessageStatuses = ["new", "handled", "archived"] as const;
export type ContactMessageStatus = (typeof contactMessageStatuses)[number];

/** A message from the contact form, as the Studio inbox and the MCP tools see it. */
export interface ContactMessage {
  id: string;
  locale: Locale;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: ContactMessageStatus;
  createdAt: string;
}

export interface ContactCursor {
  createdAt: string;
  id: string;
}

export interface ContactMessageQuery {
  status: ContactMessageStatus | null;
  cursor: ContactCursor | null;
  limit: number;
}

export interface ContactMessagePage {
  items: ContactMessage[];
  nextCursor: string | null;
}

// Control characters other than tab and line breaks are never legitimate in a message.
const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const lineBreaks = /[\r\n]/u;

export const contactIdSchema = z.string().uuid();
export const contactStatusSchema = z.enum(contactMessageStatuses);

const singleLine = (min: number, max: number) => z
  .string()
  .trim()
  .min(min)
  .max(max)
  .refine((value) => !controlCharacters.test(value) && !lineBreaks.test(value), "Contains control characters or line breaks.");

/** The fields of a message the service stores. */
export const contactMessageInputSchema = z.object({
  locale: z.enum(locales),
  name: singleLine(contactPolicy.minName, contactPolicy.maxName),
  email: z.string().trim().toLowerCase().max(contactPolicy.maxEmail).pipe(z.email()),
  subject: singleLine(contactPolicy.minSubject, contactPolicy.maxSubject),
  body: z
    .string()
    .trim()
    .min(contactPolicy.minBody)
    .max(contactPolicy.maxBody)
    .refine((value) => !controlCharacters.test(value), "Contains control characters."),
});

/** What the contact form sends: the message plus the honeypot `website`, which the delivery layer checks and never stores. */
export const contactRequestSchema = contactMessageInputSchema.extend({
  website: z.string().max(200).default(""),
});

const cursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: contactIdSchema });

export function encodeContactCursor(cursor: ContactCursor | null) {
  return cursor ? Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url") : null;
}

export function decodeContactCursor(value: string | undefined | null): ContactCursor | null {
  if (!value) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

/** Turns the `limit + 1` newest rows an adapter read into a page; the extra row only says there is more. */
export function toContactPage(rows: ContactMessage[], limit: number): ContactMessagePage {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeContactCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}
