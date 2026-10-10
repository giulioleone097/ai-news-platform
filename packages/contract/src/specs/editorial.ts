import * as z from "zod/v4";

import { locales } from "@atlasnews/core/locale";
import { batchLimit, mediaBatchLimit } from "@atlasnews/core/editorial/domain/errors";

import type { CapabilityPorts } from "../ports";

/** Pieces shared by the content specs (articles, categories, entities, media). */
export const editorLocaleSchema = z.enum(locales);
export const idSchema = z.string().uuid();
export const slugSchema = z.string().trim().min(1).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const record = z.record(z.string(), z.unknown());
export const editorialUnavailable = "The editorial operation could not be completed.";

const allOrNothing =
  "All or nothing: every item is checked first and every invalid item is reported by its index, "
  + "and nothing is written unless all are valid; the write is one transaction.";

/** The sentence that every batch tool carries, so the cap and the all-or-nothing rule are stated once. */
export function batchNote(noun: string, limit: number = batchLimit) {
  return ` Takes 1-${limit} ${noun}. ${allOrNothing} The result lists each item's id or slug and what happened.`;
}

export const mediaBatchNote = batchNote("images", mediaBatchLimit)
  .replace("the write is one transaction", "storage is not a database, so a failed upload removes the images already stored");

export const patchNote =
  "Partial update: a field you leave out keeps its stored value.";

/** Titles of up to five articles, for a confirmation question. */
export async function describeArticles(ports: CapabilityPorts, refs: ReadonlyArray<{ id: string; locale: "en" | "it" }>) {
  const repository = await ports.editorial();
  const shown = refs.slice(0, 5);
  const found = await Promise.all(shown.map(({ id, locale }) => repository.findById(id, locale).catch(() => null)));
  const names = found.map((article, index) => `“${article?.title ?? shown[index].id}”`);
  return refs.length > shown.length ? `${names.join(", ")} and ${refs.length - shown.length} more` : names.join(", ");
}
