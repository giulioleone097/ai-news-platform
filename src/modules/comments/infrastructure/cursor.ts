import * as z from "zod/v4";
import type { CommentCursor } from "../domain/comment";

const cursorPayloadSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
});
const auditCursorPayloadSchema = z.object({ id: z.number().int().positive() });

export function encodeCommentCursor(cursor: CommentCursor | null) {
  return cursor
    ? Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
    : null;
}

export function decodeCommentCursor(value: string | undefined): CommentCursor | null {
  if (!value) return null;

  try {
    return cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }
}

export function encodeAuditCursor(id: number | null) {
  return id
    ? Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url")
    : null;
}

export function decodeAuditCursor(value: string | undefined) {
  if (!value) return null;
  try {
    return auditCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    ).id;
  } catch {
    return null;
  }
}
