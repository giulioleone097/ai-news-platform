"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { studioFieldErrors } from "@/components/studio/field-errors";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import { isAllowedEditorialImageSource } from "@atlasnews/core/editorial/domain/editorial-image";
import {
  articleLimits,
  articleStatuses,
  claimStatuses,
  normalizeStoryFields,
  slugPattern,
  socialChannels,
  StoryFieldError,
} from "@atlasnews/core/editorial/domain/article";
import { uploadStudioMedia } from "@/server/media-upload";
import { articleFieldOfCode, saveStudioArticle } from "@/server/studio-article";
import { runStudioCapability } from "@/server/studio-capability";

const imageSourceSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => !value || isAllowedEditorialImageSource(value),
    "cover-source",
  );

const articleDraftSchema = z
  .object({
    id: z.string().trim().min(1).max(128).optional(),
    locale: z.enum(locales),
    title: z.string().trim().min(articleLimits.title.min).max(articleLimits.title.max),
    slug: z
      .string()
      .trim()
      .max(articleLimits.slug.max)
      .regex(slugPattern, "Use lowercase letters, numbers and hyphens")
      .optional()
      .or(z.literal("")),
    excerpt: z.string().trim().min(articleLimits.excerpt.min).max(articleLimits.excerpt.max),
    content: z.string().trim().min(articleLimits.content.min).max(articleLimits.content.max),
    categorySlug: z.string().trim().regex(slugPattern),
    status: z.enum(articleStatuses),
    featured: z.boolean(),
    coverImage: imageSourceSchema,
    coverAlt: z.string().trim().min(articleLimits.coverAlt.min).max(articleLimits.coverAlt.max),
    scheduledFor: z.string().trim().max(40).optional(),
    distribution: z
      .array(z.enum(socialChannels))
      .max(socialChannels.length)
      .transform((channels) => Array.from(new Set(channels))),
    claimStatus: z.enum(claimStatuses),
    // The slug of the same story in the other language; blank means none. Left out, the link is not touched.
    translationOf: z.string().trim().max(articleLimits.slug.max).regex(slugPattern).or(z.literal("")).optional(),
  })
  .superRefine((value, context) => {
    if (value.status !== "scheduled") return;
    if (!value.scheduledFor || !parseUtcDateTimeInput(value.scheduledFor)) {
      context.addIssue({
        code: "custom",
        path: ["scheduledFor"],
        message: studioSupplementalCopy[value.locale].scheduledRequired,
      });
    }
  });

const deleteSchema = z.object({
  id: z.string().trim().min(1).max(128),
  locale: z.enum(locales),
});

const newsletterUpdateSchema = z.object({
  id: z.string().trim().min(1).max(128),
  locale: z.enum(locales),
  status: z.literal("unsubscribed"),
});

const mediaMutationSchema = z.object({
  locale: z.enum(locales),
  path: z.string().trim().min(1).max(256).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
});

export type EditorMediaItem = { path: string; url: string; name: string; mimeType: string };

export type EditorMediaListResult =
  | { ok: true; writable: boolean; items: EditorMediaItem[] }
  | { ok: false; error: string };

export type EditorMediaUploadResult =
  | { ok: true; asset: EditorMediaItem }
  | { ok: false; error: "type" | "size" | "configuration" | "upload" };

/** The story fields as the form posts them: blank key points and blank source rows are dropped. */
function readStoryFields(formData: FormData) {
  const text = (name: string) => formData.getAll(name).map((value) => String(value).trim());
  const [titles, urls, supports] = [text("sourceTitle"), text("sourceUrl"), text("sourceSupports")];
  const primary = formData.get("primaryEntity");
  return {
    keyPoints: text("keyPoints").filter(Boolean),
    sources: titles
      .map((title, index) => ({ title, url: urls[index] ?? "", supports: supports[index] ?? "" }))
      .filter((source) => source.title || source.url || source.supports),
    entities: text("entity").map((slug) => ({ slug, isPrimary: slug === primary })),
  };
}

export async function saveArticleAction(
  _previousState: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const parsed = articleDraftSchema.safeParse({
    id: formData.get("id") || undefined,
    locale: formData.get("locale"),
    title: formData.get("title"),
    slug: formData.get("slug") || "",
    excerpt: formData.get("excerpt"),
    content: formData.get("content"),
    categorySlug: formData.get("categorySlug"),
    status: formData.get("status"),
    featured: formData.get("featured") === "on",
    coverImage: formData.get("coverImage") || "",
    coverAlt: formData.get("coverAlt"),
    scheduledFor: formData.get("scheduledFor") || undefined,
    distribution: formData.getAll("distribution"),
    claimStatus: formData.get("claimStatus"),
    translationOf: formData.get("translationOf") ?? undefined,
  });

  const story = readStoryFields(formData);
  let storyErrors: Record<string, string[]> = {};
  try {
    normalizeStoryFields(story);
  } catch (error) {
    if (!(error instanceof StoryFieldError)) throw error;
    const studio = getMessages(z.enum(locales).catch("en").parse(formData.get("locale"))).studio;
    storyErrors = {
      [error.field]: [{
        claimStatus: studio.claimStatusHelp,
        keyPoints: studio.keyPointsInvalid,
        sources: studio.sourcesInvalid,
        entities: studio.entitiesInvalid,
      }[error.field]],
    };
  }

  if (!parsed.success || Object.keys(storyErrors).length) {
    const localeResult = z.enum(locales).safeParse(formData.get("locale"));
    const locale = localeResult.success ? localeResult.data : "en";
    const articleErrors = parsed.success ? {} : studioFieldErrors(parsed.error, locale);
    if (articleErrors.coverImage) articleErrors.coverImage = [studioSupplementalCopy[locale].coverSourceInvalid];
    return {
      status: "error",
      message: studioSupplementalCopy[locale].validationError,
      fieldErrors: { ...articleErrors, ...storyErrors },
    };
  }

  const input = parsed.data;
  await requireEditor(input.locale);
  const outcome = await saveStudioArticle({
    id: input.id,
    locale: input.locale,
    title: input.title,
    slug: input.slug || undefined,
    excerpt: input.excerpt,
    content: input.content,
    categorySlug: input.categorySlug,
    status: input.status,
    featured: input.featured,
    coverImage: input.coverImage || undefined,
    coverAlt: input.coverAlt,
    scheduledFor: input.scheduledFor ? parseUtcDateTimeInput(input.scheduledFor) : null,
    distribution: input.distribution,
    claimStatus: input.claimStatus,
    translationOf: input.translationOf,
    ...story,
  });

  if (!outcome.ok) {
    // A refusal that is about one field is shown under it; any other is shown on top, in the editor's language.
    const field = outcome.code && articleFieldOfCode[outcome.code];
    return {
      status: "error",
      message: field ? studioSupplementalCopy[input.locale].validationError : outcome.error,
      ...(field ? { fieldErrors: { [field]: [outcome.error] } } : {}),
      // The article exists already when only going live failed: the next save updates it.
      ...(outcome.articleId ? { articleId: outcome.articleId } : {}),
    };
  }

  redirect(`/${input.locale}/studio/articles/${outcome.article.id}?saved=1`);
}

export async function deleteArticleAction(formData: FormData) {
  const input = deleteSchema.parse({
    id: formData.get("id"),
    locale: formData.get("locale"),
  });

  await requireEditor(input.locale);
  // The person confirmed this deletion in the page's dialog before the form was sent.
  const outcome = await runStudioCapability(input.locale, "admin_delete_article", { id: input.id, locale: input.locale }, { confirmed: true });
  if (!outcome.ok && outcome.code !== "article.notFound") throw new Error(outcome.error);
  redirect(outcome.ok ? `/${input.locale}/studio/articles?deleted=1` : `/${input.locale}/studio/articles`);
}

export async function updateNewsletterSubscriptionAction(formData: FormData) {
  const input = newsletterUpdateSchema.parse({
    id: formData.get("id"),
    locale: formData.get("locale"),
    status: formData.get("status"),
  });
  await requireEditor(input.locale);
  const outcome = await runStudioCapability(input.locale, "admin_update_newsletter_subscription", { id: input.id, status: input.status });
  if (!outcome.ok) throw new Error(outcome.error);
  revalidatePath(`/${input.locale}/studio/newsletter`);
  redirect(`/${input.locale}/studio/newsletter?updated=1`);
}

export async function uploadMediaAction(formData: FormData) {
  const locale = z.enum(locales).catch("en").parse(formData.get("locale"));
  await requireEditor(locale);
  const outcome = await uploadStudioMedia(locale, formData.get("asset"));
  if (!outcome.ok) {
    // The media page tells a file that is not accepted apart from storage that is missing or failing.
    redirect(`/${locale}/studio/media?error=${outcome.error === "type" || outcome.error === "size" ? "file" : outcome.error}`);
  }
  revalidatePath(`/${locale}/studio/media`);
  redirect(`/${locale}/studio/media?uploaded=1`);
}

export async function deleteMediaAction(formData: FormData) {
  const input = mediaMutationSchema.parse({
    locale: formData.get("locale"),
    path: formData.get("path"),
  });
  await requireEditor(input.locale);
  // The person chose to delete this exact file on the media page.
  const outcome = await runStudioCapability(input.locale, "admin_delete_media", { path: input.path }, { confirmed: true });
  // The media page only tells "in use" apart; any other refusal reads as a plain error.
  if (!outcome.ok) redirect(`/${input.locale}/studio/media?error=${outcome.code === "media.referenced" ? "in-use" : "delete"}`);
  revalidatePath(`/${input.locale}/studio/media`);
  redirect(`/${input.locale}/studio/media?deleted=1`);
}

/**
 * The media library for the Markdown editor's image picker: the `admin_list_media` capability, so the
 * editor check and the `newsroom.read` scope are the ones the MCP endpoint applies.
 */
export async function listEditorMediaAction(locale: string): Promise<EditorMediaListResult> {
  const language = z.enum(locales).catch("en").parse(locale);
  await requireEditor(language);
  const outcome = await runStudioCapability(language, "admin_list_media", {});
  if (!outcome.ok) return { ok: false, error: outcome.error };

  const { writable, items } = outcome.result as { writable: boolean; items: EditorMediaItem[] };
  return {
    ok: true,
    writable,
    items: items.map(({ path, url, name, mimeType }) => ({ path, url, name, mimeType })),
  };
}

/**
 * Uploads one image dropped or pasted into the Markdown editor. The same rules and storage as
 * `uploadMediaAction`, returning the stored URL for the editor to insert instead of redirecting.
 */
export async function uploadEditorMediaAction(formData: FormData): Promise<EditorMediaUploadResult> {
  const locale = z.enum(locales).catch("en").parse(formData.get("locale"));
  await requireEditor(locale);
  const outcome = await uploadStudioMedia(locale, formData.get("asset"));
  if (!outcome.ok) return outcome;

  revalidatePath(`/${locale}/studio/media`);
  const { path, url, name, mimeType } = outcome.asset;
  return { ok: true, asset: { path, url, name, mimeType } };
}
