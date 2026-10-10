import { en, type Messages } from "./messages/en";
import { it } from "./messages/it";
import { normalizeLocale, type Locale } from "@atlasnews/core/locale";

export * from "@atlasnews/core/locale";

const catalogs = {
  en,
  it,
} as const satisfies Record<Locale, Messages>;

export function getMessages(locale: Locale | string | null | undefined): Messages {
  return catalogs[normalizeLocale(locale)];
}

export { en, it };
export type { Messages };
