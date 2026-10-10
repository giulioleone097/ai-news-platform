import * as z from "zod/v4";

import type { Annotations } from "./capability";
import { filterFeed, openArticle, pageSpecs, readOpenArticle, saveArticle } from "./specs/page";
import { searchArticles } from "./specs/search-articles";

/** A capability of the open page as plain data: safe to serialise and to import in a client bundle. */
export interface PageCapability {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** JSON Schema (2020-12) of the arguments. */
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Annotations;
}

export const pageCapabilities: readonly PageCapability[] = pageSpecs.map((spec) => ({
  name: spec.name,
  title: spec.title,
  description: spec.description,
  inputSchema: z.toJSONSchema(spec.input, { io: "input" }) as Record<string, unknown>,
  annotations: spec.annotations,
}));

/** The specs behind `pageCapabilities`, for hosts that also check what a tool answers. */
export { pageSpecs };

const inputs = {
  search_articles: searchArticles.input,
  filter_feed: filterFeed.input,
  open_article: openArticle.input,
  read_open_article: readOpenArticle.input,
  save_article: saveArticle.input,
} as const;

export type PageToolName = keyof typeof inputs;
export type PageToolInput<N extends PageToolName> = z.output<(typeof inputs)[N]>;

/** Checks the arguments of a page tool against the same schema that `pageCapabilities` publishes. */
export function parsePageInput<N extends PageToolName>(
  name: N,
  raw: unknown,
): { ok: true; input: PageToolInput<N> } | { ok: false; error: string } {
  const result = inputs[name].safeParse(raw ?? {});
  if (result.success) return { ok: true, input: result.data as PageToolInput<N> };
  const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
  return { ok: false, error: `Invalid arguments for ${name}. ${issues.join("; ")}` };
}
