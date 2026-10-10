import { redirect } from "next/navigation";
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

/** Every category with both locales, in site order: one `admin_list_categories` call. */
export async function listCategoryRows(locale: Locale): Promise<CategoryRecord[]> {
  const listed = await runCategoryCapability(locale, "admin_list_categories", { locale: "en" });
  if (!listed.ok) throw new Error(listed.error);

  return (listed.result as { categories: CategoryRecord[] }).categories
    .map(({ translationKey, position, translations }) => ({ translationKey, position, translations }))
    .sort((first, second) => first.position - second.position);
}
