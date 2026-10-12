import * as z from "zod/v4";

import type { Annotations, Scope } from "./capability";
import { articleSpecs } from "./specs/articles";
import { categorySpecs } from "./specs/categories";
import { commentSpecs } from "./specs/comments";
import { entitySpecs } from "./specs/entities";
import { mediaSpecs } from "./specs/media";
import { newsletterSpecs } from "./specs/newsletter";
import { newsroomSpecs } from "./specs/newsroom";
import { filterFeed, openArticle, pageSpecs, readOpenArticle, saveArticle } from "./specs/page";
import { searchArticles } from "./specs/search-articles";
import { socialSpecs } from "./specs/social";
import { supportSpecs } from "./specs/support";
import { teamSpecs } from "./specs/team";

/** A capability of the open page as plain data: safe to serialise and to import in a client bundle. */
export interface PageCapability {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** JSON Schema (2020-12) of the arguments. */
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Annotations;
  /** Empty for the reader tools. The editor tools need these, as on the MCP endpoint. */
  readonly scopes: readonly Scope[];
  /** True when the tool must ask the person before it runs (publishing, deleting). */
  readonly confirms: boolean;
}

function describe(spec: {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  annotations: Annotations;
  scopes: readonly Scope[];
  confirmation?: unknown;
}): PageCapability {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: z.toJSONSchema(spec.input, { io: "input" }) as Record<string, unknown>,
    annotations: spec.annotations,
    scopes: spec.scopes,
    confirms: spec.confirmation !== undefined,
  };
}

/** The specs behind `pageCapabilities`, for hosts that also check what a tool answers. */
export { pageSpecs };

/** The reader tools of the page: they work for anyone and run in the browser. */
export const pageCapabilities: readonly PageCapability[] = pageSpecs.map(describe);

/**
 * The tools for a signed-in editor's page: what the Studio lets an editor do (articles, categories,
 * entities, media, comment moderation, inbox, distribution, newsletter, social) and the admin-only team.
 * They are the same specs as the MCP endpoint, so name, text, schema, hints, scopes and confirmation are
 * defined once. The page runs them against the server, which checks the editor's scopes.
 */
export const editorPageSpecs = [
  ...articleSpecs, ...categorySpecs, ...entitySpecs, ...mediaSpecs, ...newsroomSpecs, ...commentSpecs, ...newsletterSpecs,
  ...socialSpecs, ...supportSpecs, ...teamSpecs,
].filter((spec) => (spec.surfaces as readonly string[]).includes("page"));
export const editorPageCapabilities: readonly PageCapability[] = editorPageSpecs.map(describe);

const inputs = {
  search_articles: searchArticles.input,
  filter_feed: filterFeed.input,
  open_article: openArticle.input,
  read_open_article: readOpenArticle.input,
  save_article: saveArticle.input,
} as const;

export type PageToolName = keyof typeof inputs;
export type PageToolInput<N extends PageToolName> = z.output<(typeof inputs)[N]>;

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

/** The same check for an editor tool by name; an unknown name is an invalid call. */
export function parseEditorPageInput(name: string, raw: unknown): ParseResult<Record<string, unknown>> {
  const spec = editorPageSpecs.find((candidate) => candidate.name === name);
  if (!spec) return { ok: false, error: `Unknown editor tool ${name}.` };
  return parse(name, spec.input as unknown as z.ZodType<Record<string, unknown>>, raw);
}
