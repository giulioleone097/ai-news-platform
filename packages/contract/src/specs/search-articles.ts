import * as z from "zod/v4";

import { readOnly } from "../annotations";
import { defineSpec } from "../capability";
import {
  articleSummaryOutputSchema,
  claimStatusSchema,
  entitySlugSchema,
  localeSchema,
  newsroomAppUri,
} from "./shared";

/**
 * The MCP tool. The open page has a tool of the same name (`searchArticlesOnPage` in `page.ts`) with the same
 * input and text, but it answers from the site's feed API and shows the results page, so it declares its own output.
 */
export const searchArticles = defineSpec({
  name: "search_articles",
  title: "Search published AI news",
  description:
    "Search published AtlasNews articles by title, excerpt, body and category in English or Italian.",
  input: z.object({
    locale: localeSchema,
    query: z.string().trim().min(2).max(160),
    entity: entitySlugSchema.optional(),
    claimStatus: claimStatusSchema.optional(),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  output: z.object({ items: z.array(articleSummaryOutputSchema) }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp"],
  ui: newsroomAppUri,
});
