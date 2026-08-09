import type { Locale } from "@/i18n";

export interface EditorialCacheInvalidation {
  locale: Locale;
  slugs: readonly string[];
}

export type EditorialCacheInvalidator = (
  invalidation: EditorialCacheInvalidation,
) => void | Promise<void>;
