import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import type { Locale } from "@/i18n";

export interface CategoryTextValues {
  name: string;
  slug: string;
  description: string;
}

/** What the form posts, as typed: returned with an error so the inputs keep it. */
export type CategoryFormValues = { position: string } & Record<Locale, CategoryTextValues>;

export interface CategoryActionState {
  status: "idle" | "error";
  message?: string;
  values?: CategoryFormValues;
}

export const idleCategoryActionState: CategoryActionState = { status: "idle" };

export function categoryFormValues(category?: CategoryRecord): CategoryFormValues {
  const text = (locale: Locale): CategoryTextValues => ({
    name: category?.translations[locale]?.name ?? "",
    slug: category?.translations[locale]?.slug ?? "",
    description: category?.translations[locale]?.description ?? "",
  });
  return {
    position: category ? String(category.position) : "",
    en: text("en"),
    it: text("it"),
  };
}
