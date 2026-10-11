"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { editorImageTypes, maxEditorImageBytes } from "@/components/studio/markdown-media";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import {
  hasExpectedImageSignature,
  isAllowedEditorialImageSource,
} from "@atlasnews/core/editorial/domain/editorial-image";
import {
  articleStatuses,
  claimStatuses,
  normalizeStoryFields,
  socialChannels,
  StoryFieldError,
} from "@atlasnews/core/editorial/domain/article";
import { getStudioEditorialRepositories } from "@/server/composition";
import { invalidatePublicEditorialCache } from "@/lib/editorial-cache";
import { runEditorCapability } from "@/server/capabilities";
import { ArticleCommandService } from "@atlasnews/core/editorial/application/article-commands";
import { MediaCommandService } from "@atlasnews/core/editorial/application/media-commands";
import { EditorialRuleError } from "@atlasnews/core/editorial/domain/errors";

const imageSourceSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => !value || isAllowedEditorialImageSource(value),
    "Use bundled media or an image from the configured editorial bucket",
  );

const articleDraftSchema = z
  .object({
    id: z.string().trim().min(1).max(128).optional(),
    locale: z.enum(locales),
    title: z.string().trim().min(8).max(180),
    slug: z
      .string()
      .trim()
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
      .optional()
      .or(z.literal("")),
    excerpt: z.string().trim().min(20).max(360),
    content: z.string().trim().min(20).max(100_000),
    categorySlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    status: z.enum(articleStatuses),
    featured: z.boolean(),
    coverImage: imageSourceSchema,
    coverAlt: z.string().trim().min(3).max(240),
    scheduledFor: z.string().trim().max(40).optional(),
    distribution: z
      .array(z.enum(socialChannels))
      .max(socialChannels.length)
      .transform((channels) => Array.from(new Set(channels))),
    claimStatus: z.enum(claimStatuses),
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

const allowedMediaTypes = new Set<string>(editorImageTypes);

export type EditorMediaItem = { path: string; url: string; name: string; mimeType: string };

export type EditorMediaListResult =
  | { ok: true; writable: boolean; items: EditorMediaItem[] }
  | { ok: false; error: string };

export type EditorMediaUploadResult =
  | { ok: true; asset: EditorMediaItem }
  | { ok: false; error: "type" | "size" | "configuration" | "upload" };

function getFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, errors] of Object.entries(flattened)) {
    if (errors?.length) fieldErrors[field] = errors;
  }
  return fieldErrors;
}

/** Public outputs are refreshed by the shared owner; the Studio pages that show the change are added here. */
function revalidateEditorialPaths(locale: (typeof locales)[number], slug?: string) {
  invalidatePublicEditorialCache({ locale, slugs: slug ? [slug] : [] });
  revalidatePath(`/${locale}/studio`);
  revalidatePath(`/${locale}/studio/articles`);
}

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
    return {
      status: "error",
      message: studioSupplementalCopy[locale].validationError,
      fieldErrors: { ...(parsed.success ? {} : getFieldErrors(parsed.error)), ...storyErrors },
    };
  }

  const input = parsed.data;
  const scheduledFor = input.scheduledFor
    ? parseUtcDateTimeInput(input.scheduledFor)
    : null;
  await requireEditor(input.locale);
  const repositories = await getStudioEditorialRepositories();
  const commands = new ArticleCommandService(repositories.articles);
  let article;

  try {
    article = await commands.save({
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
      scheduledFor: input.status === "scheduled" ? scheduledFor : null,
      distribution: input.distribution,
      claimStatus: input.claimStatus,
      ...story,
    });
  } catch {
    return { status: "error", message: studioSupplementalCopy[input.locale].saveError };
  }

  revalidateEditorialPaths(input.locale, article.slug);
  redirect(`/${input.locale}/studio/articles/${article.id}?saved=1`);
}

export async function deleteArticleAction(formData: FormData) {
  const input = deleteSchema.parse({
    id: formData.get("id"),
    locale: formData.get("locale"),
  });

  await requireEditor(input.locale);
  const repositories = await getStudioEditorialRepositories();
  const article = await repositories.articles.findById(input.id, input.locale);
  if (!article) redirect(`/${input.locale}/studio/articles`);

  await new ArticleCommandService(repositories.articles).delete(article.id);
  revalidateEditorialPaths(input.locale, article.slug);
  redirect(`/${input.locale}/studio/articles?deleted=1`);
}

export async function updateNewsletterSubscriptionAction(formData: FormData) {
  const input = newsletterUpdateSchema.parse({
    id: formData.get("id"),
    locale: formData.get("locale"),
    status: formData.get("status"),
  });
  await requireEditor(input.locale);
  const outcome = await runEditorCapability("admin_update_newsletter_subscription", { id: input.id, status: input.status });
  if (!outcome.ok) throw new Error(outcome.error);
  revalidatePath(`/${input.locale}/studio/newsletter`);
  redirect(`/${input.locale}/studio/newsletter?updated=1`);
}

export async function uploadMediaAction(formData: FormData) {
  const locale = z.enum(locales).catch("en").parse(formData.get("locale"));
  await requireEditor(locale);
  const asset = formData.get("asset");
  if (!(asset instanceof File) || !asset.size || asset.size > maxEditorImageBytes || !allowedMediaTypes.has(asset.type)) {
    redirect(`/${locale}/studio/media?error=file`);
  }
  const bytes = new Uint8Array(await asset.arrayBuffer());
  if (!hasExpectedImageSignature(bytes, asset.type)) {
    redirect(`/${locale}/studio/media?error=file`);
  }

  const repositories = await getStudioEditorialRepositories();
  if (!repositories.media.writable) redirect(`/${locale}/studio/media?error=configuration`);
  try {
    await repositories.media.uploadAsset({
      name: asset.name.slice(0, 160),
      mimeType: asset.type,
      bytes,
    });
  } catch {
    redirect(`/${locale}/studio/media?error=upload`);
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
  const repositories = await getStudioEditorialRepositories();
  try {
    await new MediaCommandService(repositories.media).deleteOne(input.path);
  } catch (error) {
    if (!(error instanceof EditorialRuleError)) throw error;
    // The media page only tells "in use" apart; any other refusal reads as a plain error.
    redirect(`/${input.locale}/studio/media?error=${error.message.includes("referenced") ? "in-use" : "delete"}`);
  }
  revalidatePath(`/${input.locale}/studio/media`);
  redirect(`/${input.locale}/studio/media?deleted=1`);
}

/**
 * The media library for the Markdown editor's image picker: the `admin_list_media` capability, so the
 * editor check and the `newsroom.read` scope are the ones the MCP endpoint applies.
 */
export async function listEditorMediaAction(locale: string): Promise<EditorMediaListResult> {
  await requireEditor(z.enum(locales).catch("en").parse(locale));
  const outcome = await runEditorCapability("admin_list_media", {});
  if (!outcome.ok) return { ok: false, error: outcome.error };

  const { writable, items } = outcome.result as { writable: boolean; items: EditorMediaItem[] };
  return {
    ok: true,
    writable,
    items: items.map(({ path, url, name, mimeType }) => ({ path, url, name, mimeType })),
  };
}

/**
 * Uploads one image dropped or pasted into the Markdown editor. The same checks and storage as
 * `uploadMediaAction`, returning the stored URL for the editor to insert instead of redirecting.
 * Images are up to 8 MiB, larger than the `admin_upload_media` capability takes over MCP.
 */
export async function uploadEditorMediaAction(formData: FormData): Promise<EditorMediaUploadResult> {
  const locale = z.enum(locales).catch("en").parse(formData.get("locale"));
  await requireEditor(locale);
  const asset = formData.get("asset");
  if (!(asset instanceof File) || !allowedMediaTypes.has(asset.type)) return { ok: false, error: "type" };
  if (!asset.size || asset.size > maxEditorImageBytes) return { ok: false, error: "size" };
  const bytes = new Uint8Array(await asset.arrayBuffer());
  if (!hasExpectedImageSignature(bytes, asset.type)) return { ok: false, error: "type" };

  const repositories = await getStudioEditorialRepositories();
  if (!repositories.media.writable) return { ok: false, error: "configuration" };
  try {
    const stored = await new MediaCommandService(repositories.media).uploadOne({
      name: asset.name.slice(0, 160),
      mimeType: asset.type,
      bytes,
    });
    revalidatePath(`/${locale}/studio/media`);
    return {
      ok: true,
      asset: { path: stored.path, url: stored.url, name: stored.name, mimeType: stored.mimeType },
    };
  } catch {
    return { ok: false, error: "upload" };
  }
}
