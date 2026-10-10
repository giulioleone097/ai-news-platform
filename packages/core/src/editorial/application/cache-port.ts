import type { Locale } from "../../locale";

export interface EditorialCacheInvalidation {
  locale: Locale;
  slugs: readonly string[];
}

export type EditorialCacheInvalidator = (
  invalidation: EditorialCacheInvalidation,
) => void | Promise<void>;
