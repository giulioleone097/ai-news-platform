"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StudioActionState } from "@/components/studio/action-state";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { locales } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import {
  articleStatuses,
  socialChannels,
} from "@/modules/editorial/domain/article";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

const imageSourceSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value || value.startsWith("/")) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Use an absolute site path or an HTTP(S) URL");

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
    if (!value.scheduledFor || Number.isNaN(Date.parse(value.scheduledFor))) {
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

function getFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, errors] of Object.entries(flattened)) {
    if (errors?.length) fieldErrors[field] = errors;
  }
  return fieldErrors;
}

function revalidateEditorialPaths(locale: (typeof locales)[number], slug?: string) {
  revalidatePath(`/${locale}`);
  revalidatePath(`/${locale}/latest`);
  revalidatePath(`/${locale}/search`);
  revalidatePath(`/${locale}/articles/[slug]`, "page");
  revalidatePath(`/${locale}/categories/[slug]`, "page");
  revalidatePath(`/${locale}/studio`);
  revalidatePath(`/${locale}/studio/articles`);
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
  await requireEditor(input.locale);
  const repositories = await getStudioEditorialRepositories();
  let article;

  try {
    article = await repositories.articles.save({
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
      scheduledFor:
        input.status === "scheduled" && input.scheduledFor
          ? new Date(input.scheduledFor).toISOString()
          : null,
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

  await repositories.articles.delete(article.id);
  revalidateEditorialPaths(input.locale, article.slug);
  redirect(`/${input.locale}/studio/articles?deleted=1`);
}
