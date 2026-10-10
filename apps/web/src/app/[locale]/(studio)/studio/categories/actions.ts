"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CategoryPatch, CategoryRecord, CategoryTextPatch } from "@atlasnews/core/editorial/domain/category";
import { locales, isLocale, type Locale } from "@/i18n";
import { runCategoryCapability } from "@/components/studio/categories/category-data";
import type {
  CategoryActionState,
  CategoryFormValues,
  CategoryTextValues,
} from "@/components/studio/categories/category-form-state";
import type { CapabilityRunResult } from "@/server/capabilities";
import { categoryCopy } from "./copy";

function readLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return isLocale(value) ? value : "en";
}

function readValues(formData: FormData): CategoryFormValues {
  const text = (name: string) => String(formData.get(name) ?? "");
  const localeText = (locale: Locale): CategoryTextValues => ({
    name: text(`${locale}.name`),
    slug: text(`${locale}.slug`),
    description: text(`${locale}.description`),
  });
  return { position: text("position"), en: localeText("en"), it: localeText("it") };
}

/** Blank means "no position": the capability then places the category last (create) or keeps it (edit). */
function parsePosition(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

/** A blank slug is left out so the capability derives it from the name. */
function newText({ name, slug, description }: CategoryTextValues) {
  return {
    name: name.trim(),
    ...(slug.trim() ? { slug: slug.trim() } : {}),
    ...(description.trim() ? { description: description.trim() } : {}),
  };
}

function createInput(values: CategoryFormValues) {
  const position = parsePosition(values.position);
  return {
    translations: { en: newText(values.en), it: newText(values.it) },
    ...(position === undefined ? {} : { position }),
  };
}

/** Only the fields that differ from the stored category are sent. A blank slug keeps the stored one. */
function patchInput(translationKey: string, stored: CategoryRecord, values: CategoryFormValues): CategoryPatch {
  const patch: CategoryPatch = { translationKey };
  const position = parsePosition(values.position);
  if (position !== undefined && position !== stored.position) patch.position = position;

  const translations: Partial<Record<Locale, CategoryTextPatch>> = {};
  for (const locale of locales) {
    const current = stored.translations[locale];
    const submitted = values[locale];
    const changed: CategoryTextPatch = {};
    if (submitted.name.trim() !== current?.name) changed.name = submitted.name.trim();
    if (submitted.slug.trim() && submitted.slug.trim() !== current?.slug) changed.slug = submitted.slug.trim();
    if (submitted.description.trim() !== (current?.description ?? "")) changed.description = submitted.description.trim();
    if (Object.keys(changed).length) translations[locale] = changed;
  }
  if (Object.keys(translations).length) patch.translations = translations;
  return patch;
}

async function updateCategory(
  locale: Locale,
  translationKey: string,
  values: CategoryFormValues,
): Promise<CapabilityRunResult> {
  const current = await runCategoryCapability(locale, "admin_get_category", { translationKey });
  if (!current.ok) return current;

  const patch = patchInput(translationKey, (current.result as { category: CategoryRecord }).category, values);
  // Nothing differs from the stored category: there is nothing to write, which counts as saved.
  if (Object.keys(patch).length === 1) return { ok: true, result: {} };
  return runCategoryCapability(locale, "admin_update_category", patch);
}

export async function saveCategoryAction(
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const locale = readLocale(formData);
  const translationKey = String(formData.get("translationKey") ?? "").trim();
  const values = readValues(formData);
  const outcome = translationKey
    ? await updateCategory(locale, translationKey, values)
    : await runCategoryCapability(locale, "admin_create_category", createInput(values));

  if (!outcome.ok) {
    return {
      status: "error",
      message: outcome.status === 400 ? outcome.error : categoryCopy[locale].saveFailed,
      values,
    };
  }
  revalidatePath(`/${locale}/studio/categories`);
  redirect(`/${locale}/studio/categories?saved=1`);
}

export async function deleteCategoryAction(
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const locale = readLocale(formData);
  const translationKey = String(formData.get("translationKey") ?? "");
  // The person confirmed this exact delete in the page before the form was submitted.
  const outcome = await runCategoryCapability(
    locale,
    "admin_delete_category",
    { translationKey },
    { confirmed: true },
  );

  if (!outcome.ok) {
    return {
      status: "error",
      message: outcome.status === 400 ? outcome.error : categoryCopy[locale].deleteFailed,
    };
  }
  revalidatePath(`/${locale}/studio/categories`);
  redirect(`/${locale}/studio/categories?deleted=1`);
}
