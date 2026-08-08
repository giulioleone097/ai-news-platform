import { en, type Messages } from "./messages/en";
import { it } from "./messages/it";

export const locales = ["en", "it"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeLabels = {
  en: "English",
  it: "Italiano",
} as const satisfies Record<Locale, string>;

const catalogs = {
  en,
  it,
} as const satisfies Record<Locale, Messages>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function assertLocale(value: unknown): asserts value is Locale {
  if (!isLocale(value)) {
    throw new RangeError(`Unsupported locale: ${String(value)}`);
  }
}

export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== "string") {
    return defaultLocale;
  }

  const language = value.trim().replaceAll("_", "-").toLowerCase().split("-")[0];
  return isLocale(language) ? language : defaultLocale;
}

export function getMessages(locale: Locale | string | null | undefined): Messages {
  return catalogs[normalizeLocale(locale)];
}

export function localizedPath(pathname: string, locale: Locale): string {
  assertLocale(locale);

  const input = pathname.trim();
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(input)) {
    throw new TypeError("localizedPath accepts application paths only");
  }

  const suffixIndex = input.search(/[?#]/);
  const rawPath = suffixIndex === -1 ? input : input.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : input.slice(suffixIndex);
  const absolutePath = rawPath.length === 0
    ? "/"
    : rawPath.startsWith("/")
      ? rawPath
      : `/${rawPath}`;
  const localePrefix = new RegExp(`^/(?:${locales.join("|")})(?=/|$)`, "i");
  const unprefixedPath = absolutePath.replace(localePrefix, "") || "/";
  const localized = unprefixedPath === "/" ? `/${locale}` : `/${locale}${unprefixedPath}`;

  return `${localized}${suffix}`;
}

export function getAlternates(pathname: string, currentLocale: Locale = defaultLocale): {
  canonical: string;
  languages: Record<Locale | "x-default", string>;
} {
  const canonical = localizedPath(pathname, currentLocale);
  const languages = Object.fromEntries([
    ...locales.map((locale) => [locale, localizedPath(pathname, locale)] as const),
    ["x-default", canonical] as const,
  ]) as Record<Locale | "x-default", string>;

  return { canonical, languages };
}

export { en, it };
export type { Messages };
