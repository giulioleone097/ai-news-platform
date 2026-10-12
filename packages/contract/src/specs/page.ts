import * as z from "zod/v4";

import { locales } from "@atlasnews/core/locale";
import {
  articleLimits,
  articleStatuses,
  draftStatuses,
  slugPattern,
  socialChannels,
  storyLimits,
} from "@atlasnews/core/editorial/domain/article";
import { isAllowedEditorialImageSource } from "@atlasnews/core/editorial/domain/editorial-image";

import { pageState, readOnly } from "../annotations";
import { defineSpec } from "../capability";
import { searchArticles } from "./search-articles";
import { articleSlugSchema, categorySlugSchema, claimStatusSchema, entitySlugSchema, localeSchema, sourceOutputSchema } from "./shared";

/**
 * Work that needs the open page: no server handler exists for these. The site registers them
 * as page tools and runs them against the reader's browser. Every tool answers with the fields
 * of its `output`; when it cannot do the work it answers `{ error }` instead, never throws.
 */
const storyRef = z.object({
  slug: z.string(),
  title: z.string(),
  path: z.string(),
  claimStatus: claimStatusSchema,
  publishedAt: z.string().nullable(),
  category: z.object({ slug: z.string(), name: z.string() }),
  entity: z.object({ slug: z.string(), name: z.string() }).nullable(),
});

/** The page's `search_articles`: the MCP tool's name, text and input, but a result of the open page. */
export const searchArticlesOnPage = defineSpec({
  name: searchArticles.name,
  title: searchArticles.title,
  description: searchArticles.description,
  input: searchArticles.input,
  output: z.object({
    query: z.string().describe("The text searched for, as the search page shows it."),
    path: z.string(),
    count: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    items: z.array(storyRef),
    notShownOnPage: z.array(z.enum(["entity", "claimStatus"])).optional(),
  }),
  annotations: searchArticles.annotations,
  scopes: [],
  surfaces: ["page"],
});

export const filterFeed = defineSpec({
  name: "filter_feed",
  title: "Filter the feed",
  description:
    "Show the feed of one entity or one claim status on the page, or the main feed when neither is set. "
    + "Returns the page path and the stories shown. The page has no feed for both filters at once: "
    + "the entity feed is shown and the stories returned still match both.",
  input: z.object({
    locale: localeSchema,
    entity: entitySlugSchema.optional().describe("Entity slug to follow."),
    claimStatus: claimStatusSchema.optional(),
  }),
  output: z.object({
    path: z.string(),
    count: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    stories: z.array(storyRef),
    notShownOnPage: z.array(z.enum(["claimStatus"])).optional(),
  }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

export const openArticle = defineSpec({
  name: "open_article",
  title: "Open an article",
  description: "Open one published story on this site. Returns the page path and the title once it is open.",
  input: z.object({ locale: localeSchema, slug: articleSlugSchema }),
  output: z.object({ opened: z.boolean(), path: z.string(), title: z.string() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

export const readOpenArticle = defineSpec({
  name: "read_open_article",
  title: "Read the open article",
  description:
    "Read the story that the reader sees now. Returns its title, URL, claim status and entities, "
    + "and its text as Markdown with the key points and the sources. Returns an error when no story is open.",
  input: z.object({}),
  output: z.object({
    title: z.string(),
    url: z.string(),
    locale: z.string(),
    slug: z.string(),
    claimStatus: claimStatusSchema,
    entities: z.array(z.object({ slug: z.string(), name: z.string() })),
    text: z.string(),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["page"],
});

export const saveArticle = defineSpec({
  name: "save_article",
  title: "Save an article",
  description:
    "Save one story in the bookmarks of this browser. Returns whether it was already saved and how many stories are saved.",
  input: z.object({ locale: localeSchema, slug: articleSlugSchema }),
  output: z.object({ saved: z.boolean(), alreadySaved: z.boolean(), count: z.number().int().positive() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

/** The reader tools of the page, in the order the site registers them. */
export const pageSpecs = [searchArticlesOnPage, filterFeed, openArticle, readOpenArticle, saveArticle] as const;

/**
 * The Studio's page tools: they work on the editor open in the editor's browser, run in the page and never
 * call the server. Nothing is saved: the person reads the form and presses Save, which runs the catalogue's
 * capabilities with their scope, confirmation and attribution checks. Data and operations (list, read, create,
 * update, publish, delete, moderate, send) are MCP tools only, so no name here is the name of an MCP tool.
 */
const articleLocaleSchema = z.enum(locales);

/** The stored article behind an open form; the form of a new article has none. */
const editedArticle = z.object({
  id: z.string(),
  slug: z.string(),
  locale: articleLocaleSchema,
  status: z.enum(articleStatuses).describe("The stored status; the form's own status field may differ until it is saved."),
});

const sourceFields = z.object({
  title: z.string().max(storyLimits.sources.titleMax),
  url: z.string().max(storyLimits.sources.urlMax),
  supports: z.string().max(storyLimits.sources.supportsMax),
});

/** The fields of the article form, named and bounded as the catalogue's article tools name them. */
const articleFormFields = {
  title: z.string().max(articleLimits.title.max),
  slug: z.string().max(articleLimits.slug.max).regex(slugPattern).or(z.literal("")),
  excerpt: z.string().max(articleLimits.excerpt.max),
  content: z.string().max(articleLimits.content.max),
  categorySlug: categorySlugSchema,
  status: z.enum(draftStatuses),
  scheduledFor: z.string().datetime().nullable(),
  translationOf: articleSlugSchema.nullable(),
  claimStatus: claimStatusSchema,
  featured: z.boolean(),
  coverImage: z.string().min(1).max(2_048).refine(isAllowedEditorialImageSource, "Use bundled media or the configured editorial bucket").nullable(),
  coverAlt: z.string().max(articleLimits.coverAlt.max),
  distribution: z.array(z.enum(socialChannels)).max(socialChannels.length),
  keyPoints: z.array(z.string().max(storyLimits.keyPoints.max)).max(storyLimits.keyPoints.count),
  sources: z.array(sourceFields).max(storyLimits.sources.count),
  entities: z.array(z.object({ slug: entitySlugSchema, isPrimary: z.boolean().optional() })).max(storyLimits.entities.count),
} as const;

export const openArticleEditor = defineSpec({
  name: "open_article_editor",
  title: "Open the article editor",
  description:
    "Open the Studio article editor in this page: a blank form for a new article in the locale, or, with the slug of an article of that locale "
    + "(whatever its status), that article. Nothing is saved. Returns the path and the article the form edits (null for a new one). "
    + "Then use read_article_form and fill_article_form. It does not leave a form that has unsaved changes: ask the person to save or discard them first.",
  input: z.object({
    locale: localeSchema,
    slug: articleSlugSchema.optional().describe("Slug of the article to edit. Leave it out for a new article."),
  }),
  output: z.object({ opened: z.boolean(), path: z.string(), article: editedArticle.nullable() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

export const readArticleForm = defineSpec({
  name: "read_article_form",
  title: "Read the article form",
  description:
    "Read the article form that is open in the Studio, as it is on screen now (typed by the person or set by fill_article_form): every field, "
    + "the translation link (translationOf, the slug of the same story in the other language), the status, the article being edited, whether the form "
    + "has unsaved changes, and the errors the form shows under its fields. Returns an error when no article form is open.",
  input: z.object({}),
  output: z.object({
    locale: articleLocaleSchema,
    article: editedArticle.nullable(),
    unsaved: z.boolean().describe("True when the fields differ from the last saved article (or from a blank form)."),
    fields: z.object({
      title: z.string(),
      slug: z.string(),
      excerpt: z.string(),
      content: z.string(),
      categorySlug: z.string(),
      status: z.enum(articleStatuses),
      scheduledFor: z.string().nullable().describe("ISO date and time (UTC), or null."),
      translationOf: z.string().nullable().describe("Slug of the same story in the other language, or null."),
      claimStatus: claimStatusSchema.nullable().describe("Null until one is chosen."),
      featured: z.boolean(),
      coverImage: z.string().nullable(),
      coverAlt: z.string(),
      distribution: z.array(z.enum(socialChannels)),
      keyPoints: z.array(z.string()),
      sources: z.array(sourceOutputSchema),
      entities: z.array(z.object({ slug: z.string(), isPrimary: z.boolean() })),
    }),
    errors: z.record(z.string(), z.array(z.string())).describe("Field name to the messages the form shows under it; empty when it shows none."),
    message: z.string().optional().describe("The error shown at the top of the form, when there is one."),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["page"],
});

export const fillArticleForm = defineSpec({
  name: "fill_article_form",
  title: "Fill the article form",
  description:
    "Fill the article form that is open in the Studio as a draft: sets the fields you pass and leaves the others as they are. "
    + "Nothing is saved: the person reviews the form and presses Save, which checks the article. It cannot publish: status takes draft, review "
    + "or scheduled (scheduled needs scheduledFor). distribution, keyPoints, sources and entities replace the whole list. coverImage null removes "
    + "the cover; translationOf null removes the translation link, and the slug must be one the form offers (an article of the other language "
    + "without a translation yet). Returns the fields it set and the ones it could not, with the reason. Returns an error when no article form is open.",
  input: z.object({
    title: articleFormFields.title.optional(),
    slug: articleFormFields.slug.optional().describe("Leave empty to let the Studio derive it from the title."),
    excerpt: articleFormFields.excerpt.optional(),
    content: articleFormFields.content.optional().describe("Article body in Markdown."),
    categorySlug: articleFormFields.categorySlug.optional().describe("A category of the article's locale."),
    status: articleFormFields.status.optional(),
    scheduledFor: articleFormFields.scheduledFor.optional().describe("ISO date and time (UTC); null clears it."),
    translationOf: articleFormFields.translationOf.optional(),
    claimStatus: articleFormFields.claimStatus.optional(),
    featured: articleFormFields.featured.optional(),
    coverImage: articleFormFields.coverImage.optional(),
    coverAlt: articleFormFields.coverAlt.optional(),
    distribution: articleFormFields.distribution.optional(),
    keyPoints: articleFormFields.keyPoints.optional(),
    sources: articleFormFields.sources.optional(),
    entities: articleFormFields.entities.optional().describe("Entity slugs; the primary one is the entry marked isPrimary, or the first."),
  }),
  output: z.object({
    filled: z.array(z.string()).describe("Names of the fields that were set."),
    rejected: z.array(z.object({ field: z.string(), reason: z.string() })).describe("Fields the form could not take; the others were still set."),
    saved: z.literal(false).describe("Always false: the person saves."),
  }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

/** The Studio tools of the page, in the order the Studio registers them. */
export const studioPageSpecs = [openArticleEditor, readArticleForm, fillArticleForm] as const;
