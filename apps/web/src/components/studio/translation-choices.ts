import { locales, type Locale } from "@/i18n";
import type { Article } from "@atlasnews/core/editorial/domain/article";

export interface TranslationChoice {
  slug: string;
  title: string;
}

/** The articles in each language that a story in the other language can be linked to. */
export type TranslationChoices = Record<Locale, TranslationChoice[]>;

/** The language an article is translated into or from: the one that is not its own. */
export const counterpartLocale = (locale: Locale) => locales.find((candidate) => candidate !== locale) ?? locale;

/**
 * What the "Translation of" field offers, and which choice is made already. A story has one article per
 * language, so an article can only be linked to one whose story has no article in its own language yet.
 * When an article is being edited, its current translation is offered as well (and is the selected one),
 * and the article itself never is.
 */
export function translationChoices(
  articles: Record<Locale, readonly Article[]>,
  current?: Article,
): { choices: TranslationChoices; selected: string } {
  const choices = { en: [], it: [] } as TranslationChoices;
  let selected = "";
  for (const locale of locales) {
    const taken = new Set(
      articles[counterpartLocale(locale)].filter((article) => article.id !== current?.id).map((article) => article.translationKey),
    );
    for (const { slug, title, translationKey } of articles[locale]) {
      if (translationKey === current?.translationKey && locale !== current.locale) selected = slug;
      else if (taken.has(translationKey)) continue;
      choices[locale].push({ slug, title });
    }
  }
  return { choices, selected };
}
