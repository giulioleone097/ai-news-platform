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

/** Shared by the MCP endpoint and the open page, so it lives apart from the server-only specs. */
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
  surfaces: ["mcp", "page"],
  ui: newsroomAppUri,
});
