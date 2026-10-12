import * as z from "zod/v4";

import type { Annotations } from "./capability";
import {
  fillArticleForm,
  filterFeed,
  openArticle,
  openArticleEditor,
  pageSpecs,
  readArticleForm,
  readOpenArticle,
  saveArticle,
  searchArticlesOnPage,
  studioPageSpecs,
} from "./specs/page";

/**
 * A tool of the open page as plain data: safe to serialise and to import in a client bundle. A page tool needs
 * no scope and asks nobody: it changes what the page shows, never stored data (that is an MCP tool).
 */
export interface PageCapability {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** JSON Schema (2020-12) of the arguments. */
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Annotations;
}

function describe(spec: {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  annotations: Annotations;
}): PageCapability {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: z.toJSONSchema(spec.input, { io: "input" }) as Record<string, unknown>,
    annotations: spec.annotations,
  };
}

/** The specs behind `pageCapabilities`, for hosts that also check what a tool answers. */
export { pageSpecs };

/** The reader tools of the page: they work for anyone and run in the browser. */
export const pageCapabilities: readonly PageCapability[] = pageSpecs.map(describe);

/** The Studio tools of the page: they work on the editor that is open and run in the browser (`docs/SITE_TOOLS.md`). */
export const studioPageCapabilities: readonly PageCapability[] = studioPageSpecs.map(describe);
export { studioPageSpecs };

const inputs = {
  search_articles: searchArticlesOnPage.input,
  filter_feed: filterFeed.input,
  open_article: openArticle.input,
  read_open_article: readOpenArticle.input,
  save_article: saveArticle.input,
} as const;

const studioInputs = {
  open_article_editor: openArticleEditor.input,
  read_article_form: readArticleForm.input,
  fill_article_form: fillArticleForm.input,
} as const;

export type PageToolName = keyof typeof inputs;
export type PageToolInput<N extends PageToolName> = z.output<(typeof inputs)[N]>;
export type StudioToolName = keyof typeof studioInputs;
export type StudioToolInput<N extends StudioToolName> = z.output<(typeof studioInputs)[N]>;

/** What `read_article_form` returns, and what `fill_article_form` takes and answers: the article form registers a reader and a writer of these. */
export type ArticleFormSnapshot = z.output<typeof readArticleForm.output>;
export type ArticleFormPatch = StudioToolInput<"fill_article_form">;
export type ArticleFormFill = z.output<typeof fillArticleForm.output>;

type ParseResult<T> = { ok: true; input: T } | { ok: false; error: string };

function parse<T>(name: string, schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const result = schema.safeParse(raw ?? {});
  if (result.success) return { ok: true, input: result.data };
  const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
  return { ok: false, error: `Invalid arguments for ${name}. ${issues.join("; ")}` };
}

/** Checks the arguments of a page tool against the same schema that `pageCapabilities` publishes. */
export function parsePageInput<N extends PageToolName>(name: N, raw: unknown): ParseResult<PageToolInput<N>> {
  return parse(name, inputs[name] as unknown as z.ZodType<PageToolInput<N>>, raw);
}

/** Checks the arguments of a Studio page tool against the schema that `studioPageCapabilities` publishes. */
export function parseStudioInput<N extends StudioToolName>(name: N, raw: unknown): ParseResult<StudioToolInput<N>> {
  return parse(name, studioInputs[name] as unknown as z.ZodType<StudioToolInput<N>>, raw);
}
