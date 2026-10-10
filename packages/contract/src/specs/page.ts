import * as z from "zod/v4";

import { claimStatuses } from "@atlasnews/core/editorial/domain/article";

import { pageState, readOnly } from "../annotations";
import { defineSpec } from "../capability";
import { searchArticles } from "./search-articles";
import { articleSlugSchema, localeSchema } from "./shared";

const dateSchema = z.iso.date();

/**
 * Work that needs the open page: no server handler exists for these. The site registers them
 * as page tools and runs them against the reader's browser.
 */
export const filterFeed = defineSpec({
  name: "filter_feed",
  title: "Filter the feed",
  description: "Set the entity, the claim status and the dates of the feed that the page shows.",
  input: z.object({
    locale: localeSchema,
    entity: z.string().trim().min(1).max(80).optional().describe("Entity slug to follow."),
    claimStatus: z.enum(claimStatuses).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  }),
  output: z.object({ count: z.number().int().nonnegative() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

export const openArticle = defineSpec({
  name: "open_article",
  title: "Open an article",
  description: "Open one published story on this site.",
  input: z.object({ locale: localeSchema, slug: articleSlugSchema }),
  output: z.object({ opened: z.boolean() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

export const readOpenArticle = defineSpec({
  name: "read_open_article",
  title: "Read the open article",
  description: "Read the story that the reader sees now, as Markdown.",
  input: z.object({}),
  output: z.object({ title: z.string(), url: z.string(), text: z.string() }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["page"],
});

export const saveArticle = defineSpec({
  name: "save_article",
  title: "Save an article",
  description: "Save one story in the bookmarks of this browser.",
  input: z.object({ locale: localeSchema, slug: articleSlugSchema }),
  output: z.object({ saved: z.boolean() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

/** Every spec offered on the page, in the order the site registers them. */
export const pageSpecs = [searchArticles, filterFeed, openArticle, readOpenArticle, saveArticle] as const;
