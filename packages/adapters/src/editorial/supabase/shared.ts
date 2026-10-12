import { z } from "zod";
import { locales } from "@atlasnews/core/locale";

export const categorySchema = z.object({
  id: z.string(),
  translation_key: z.string(),
  locale: z.enum(locales),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export function relationOne<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

export type EditorialRepositoryOptions = {
  /** `public` serves the anonymous site and omits editor-only data; `editorial` serves Studio and admin MCP. */
  audience: "public" | "editorial";
  /** Author recorded for writes made with a service-role client, which has no signed-in editor. */
  authorId?: string;
};
