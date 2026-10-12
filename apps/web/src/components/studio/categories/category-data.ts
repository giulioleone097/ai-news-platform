import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import type { Locale } from "@/i18n";
import { runStudioCapability } from "@/server/studio-capability";

/** Every category with both locales, in site order: one `admin_list_categories` call. */
export async function listCategoryRows(locale: Locale): Promise<CategoryRecord[]> {
  const listed = await runStudioCapability(locale, "admin_list_categories", { locale: "en" });
  if (!listed.ok) throw new Error(listed.error);

  return (listed.result as { categories: CategoryRecord[] }).categories
    .map(({ translationKey, position, translations }) => ({ translationKey, position, translations }))
    .sort((first, second) => first.position - second.position);
}
