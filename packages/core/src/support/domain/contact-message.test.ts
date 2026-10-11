import { describe, expect, it } from "vitest";
import {
  contactPolicy,
  contactRequestSchema,
  decodeContactCursor,
  encodeContactCursor,
  toContactPage,
  type ContactMessage,
} from "./contact-message";

const valid = {
  locale: "en",
  name: "  Ada Lovelace ",
  email: " Ada@Example.COM ",
  subject: "A correction",
  body: "The article names the wrong model in its second paragraph.",
};

describe("contact request validation", () => {
  it("trims the fields and lowercases the address", () => {
    expect(contactRequestSchema.parse(valid)).toEqual({
      ...valid,
      name: "Ada Lovelace",
      email: "ada@example.com",
      website: "",
    });
  });

  it.each([
    ["a locale outside en and it", { locale: "fr" }],
    ["a one-letter name", { name: "A" }],
    ["a name over the limit", { name: "n".repeat(contactPolicy.maxName + 1) }],
    ["an address without a domain", { email: "ada@" }],
    ["an address over the limit", { email: `${"a".repeat(250)}@example.com` }],
    ["a subject with a line break", { subject: "Hello\nBcc: someone@example.com" }],
    ["a subject over the limit", { subject: "s".repeat(contactPolicy.maxSubject + 1) }],
    ["a body below the minimum", { body: "Too short" }],
    ["a body over the limit", { body: "b".repeat(contactPolicy.maxBody + 1) }],
    ["a body with a null character", { body: "A message with a \u0000 inside it." }],
  ])("rejects %s", (_label, change) => {
    expect(contactRequestSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });

  it("accepts line breaks and tabs in the body", () => {
    expect(contactRequestSchema.safeParse({ ...valid, body: "First line.\r\n\tSecond line, indented." }).success).toBe(true);
  });
});

describe("contact cursor and pages", () => {
  const row = (id: string, createdAt: string): ContactMessage => ({
    id,
    locale: "en",
    name: "Ada",
    email: "ada@example.com",
    subject: "Subject",
    body: "A body long enough.",
    status: "new",
    createdAt,
  });

  it("round-trips a cursor and refuses anything else", () => {
    const cursor = { createdAt: "2026-10-11T10:00:00.000Z", id: "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f" };
    expect(decodeContactCursor(encodeContactCursor(cursor))).toEqual(cursor);
    expect(decodeContactCursor("not-a-cursor")).toBeNull();
    expect(decodeContactCursor(undefined)).toBeNull();
    expect(encodeContactCursor(null)).toBeNull();
  });

  it("offers a next cursor only when a row beyond the limit exists", () => {
    const rows = [
      row("6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e61", "2026-10-11T10:00:03.000Z"),
      row("6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e62", "2026-10-11T10:00:02.000Z"),
      row("6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e63", "2026-10-11T10:00:01.000Z"),
    ];
    const more = toContactPage(rows, 2);
    expect(more.items).toHaveLength(2);
    expect(decodeContactCursor(more.nextCursor)).toEqual({ createdAt: rows[1].createdAt, id: rows[1].id });
    expect(toContactPage(rows.slice(0, 2), 2).nextCursor).toBeNull();
  });
});
