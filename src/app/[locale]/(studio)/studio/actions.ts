"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { parseUtcDateTimeInput } from "@/lib/editorial-datetime";
import {
  hasExpectedImageSignature,
  isAllowedEditorialImageSource,
} from "@/lib/editorial-image";
import {
  articleStatuses,
  socialChannels,
} from "@/modules/editorial/domain/article";
import {
  distributionStatuses,
  newsletterStatuses,
} from "@/modules/editorial/domain/editorial-operations";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";
import { articlesCacheTag } from "@/lib/editorial-cache";
import { ArticleCommandService } from "@/modules/editorial/application/article-commands";

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

const distributionUpdateSchema = z.object({
  id: z.string().trim().min(1).max(160),
  locale: z.enum(locales),
  status: z.enum(distributionStatuses),
  message: z.string().trim().max(1_000),
  externalUrl: z
    .string()
    .trim()
    .max(2_048)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    }),
  scheduledFor: z
    .string()
    .trim()
    .max(40)
    .refine((value) => !value || Boolean(parseUtcDateTimeInput(value))),
});

const newsletterUpdateSchema = z.object({
  id: z.string().trim().min(1).max(128),
  locale: z.enum(locales),
  status: z.enum(newsletterStatuses),
});

const mediaMutationSchema = z.object({
  locale: z.enum(locales),
  path: z.string().trim().min(1).max(256).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
});

const allowedMediaTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, errors] of Object.entries(flattened)) {
    if (errors?.length) fieldErrors[field] = errors;
  }
  return fieldErrors;
}

function revalidateEditorialPaths(locale: (typeof locales)[number], slug?: string) {
  updateTag(articlesCacheTag);
  revalidatePath(`/${locale}`);
  revalidatePath(`/${locale}/latest`);
  revalidatePath(`/${locale}/search`);
  revalidatePath(`/${locale}/articles/[slug]`, "page");
  revalidatePath(`/${locale}/categories/[slug]`, "page");
  revalidatePath(`/${locale}/studio`);
  revalidatePath(`/${locale}/studio/articles`);
  revalidatePath("/api/articles");
  revalidatePath(`/${locale}/feed.xml`);
  if (slug) revalidatePath(`/${locale}/articles/${slug}`);
  revalidatePath("/sitemap.xml");
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
  });

  if (!parsed.success) {
    const localeResult = z.enum(locales).safeParse(formData.get("locale"));
    const locale = localeResult.success ? localeResult.data : "en";
    return {
      status: "error",
      message: studioSupplementalCopy[locale].validationError,
      fieldErrors: getFieldErrors(parsed.error),
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

export async function updateDistributionAction(formData: FormData) {
  const parsed = distributionUpdateSchema.safeParse({
    id: formData.get("id"),
    locale: formData.get("locale"),
    status: formData.get("status"),
    message: formData.get("message") || "",
    externalUrl: formData.get("externalUrl") || "",
    scheduledFor: formData.get("scheduledFor") || "",
  });
  const fallbackLocale = z.enum(locales).catch("en").parse(formData.get("locale"));
  if (!parsed.success) redirect(`/${fallbackLocale}/studio/distribution?error=validation`);

  const input = parsed.data;
  await requireEditor(input.locale);
  const repositories = await getStudioEditorialRepositories();
  try {
    await repositories.distribution.updatePublication({
      id: input.id,
      status: input.status,
      message: input.message,
      externalUrl: input.externalUrl || null,
      scheduledFor: input.scheduledFor
        ? parseUtcDateTimeInput(input.scheduledFor)
        : null,
    });
  } catch {
    redirect(`/${input.locale}/studio/distribution?error=save`);
  }
  revalidatePath(`/${input.locale}/studio/distribution`);
  redirect(`/${input.locale}/studio/distribution?updated=1`);
}

export async function updateNewsletterSubscriptionAction(formData: FormData) {
  const input = newsletterUpdateSchema.parse({
    id: formData.get("id"),
    locale: formData.get("locale"),
    status: formData.get("status"),
  });
  await requireEditor(input.locale);
  const repositories = await getStudioEditorialRepositories();
  await repositories.newsletter.updateSubscriptionStatus(input.id, input.status);
  revalidatePath(`/${input.locale}/studio/newsletter`);
  redirect(`/${input.locale}/studio/newsletter?updated=1`);
}

export async function uploadMediaAction(formData: FormData) {
  const locale = z.enum(locales).catch("en").parse(formData.get("locale"));
  await requireEditor(locale);
  const asset = formData.get("asset");
  if (!(asset instanceof File) || !asset.size || asset.size > 8_388_608 || !allowedMediaTypes.has(asset.type)) {
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
  if (!repositories.media.writable) redirect(`/${input.locale}/studio/media?error=configuration`);

  const assets = await repositories.media.listAssets();
  const asset = assets.find((item) => item.path === input.path);
  if (!asset) redirect(`/${input.locale}/studio/media?error=missing`);
  if (await repositories.media.isAssetReferenced(asset.path)) {
    redirect(`/${input.locale}/studio/media?error=in-use`);
  }

  await repositories.media.deleteAsset(input.path);
  revalidatePath(`/${input.locale}/studio/media`);
  redirect(`/${input.locale}/studio/media?deleted=1`);
}
