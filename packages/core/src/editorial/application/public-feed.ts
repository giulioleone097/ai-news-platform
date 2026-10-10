import * as z from "zod/v4";
import type { ArticleCursor } from "../domain/article";

export const publicArchivePageSize = 6;

const articleCursorSchema = z.object({
  publishedAt: z.iso.datetime(),
  id: z.string().min(1).max(200),
});

export function encodeArticleCursor(cursor: ArticleCursor | null) {
  return cursor
    ? Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
    : null;
}

export function decodeArticleCursor(value: string) {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const result = articleCursorSchema.safeParse(decoded);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
