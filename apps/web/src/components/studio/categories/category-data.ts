import { redirect } from "next/navigation";
import type { Category } from "@atlasnews/core/editorial/domain/article";
import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import type { Locale } from "@/i18n";
import {
  runEditorCapability,
  type CapabilityRunOptions,
  type CapabilityRunResult,
} from "@/server/capabilities";

/** Runs one capability for the signed-in editor; a missing sign-in goes to the login page, as the other Studio screens do. */
export async function runCategoryCapability(
  locale: Locale,
  name: string,
  input: unknown,
  options: CapabilityRunOptions = {},
): Promise<CapabilityRunResult> {
  const outcome = await runEditorCapability(name, input, options);
  if (!outcome.ok && outcome.status === 401) redirect(`/${locale}/login`);
  return outcome;
}

/**
 * Every category with both locales, in site order. The English list gives the keys (every
 * category has an English row); each one is then read for its position and Italian row.
 */
export async function listCategoryRows(locale: Locale): Promise<CategoryRecord[]> {
  const listed = await runCategoryCapability(locale, "admin_list_categories", { locale: "en" });
  if (!listed.ok) throw new Error(listed.error);

  const keys = (listed.result as { categories: Category[] }).categories.map((category) => category.translationKey);
  const rows = await Promise.all(keys.map(async (translationKey) => {
    const loaded = await runCategoryCapability(locale, "admin_get_category", { translationKey });
    if (!loaded.ok) throw new Error(loaded.error);
    return (loaded.result as { category: CategoryRecord }).category;
  }));
  return rows.sort((first, second) => first.position - second.position);
}
