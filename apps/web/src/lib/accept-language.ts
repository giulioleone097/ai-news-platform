import { defaultLocale, locales, type Locale } from "@atlasnews/core/locale";

/** The supported language that comes first in a browser's `Accept-Language` by weight; the default locale when none does. */
export function preferredLocale(header: string | null | undefined): Locale {
  const choices = (header ?? "")
    .split(",")
    .map((part, position) => {
      const [tag = "", ...parameters] = part.split(";");
      const quality = parameters.find((parameter) => /^\s*q\s*=/i.test(parameter));
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        // A weight that is not a number never matches `weight > 0` below, so such an entry is ignored.
        weight: quality === undefined ? 1 : Number(quality.split("=")[1]),
        position,
      };
    })
    .filter(({ language, weight }) => weight > 0 && (locales as readonly string[]).includes(language))
    .sort((left, right) => right.weight - left.weight || left.position - right.position);
  return (choices[0]?.language as Locale | undefined) ?? defaultLocale;
}
