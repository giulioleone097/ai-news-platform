import { describe, expect, it } from "vitest";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { translationChoices } from "./translation-choices";

function article(id: string, locale: "en" | "it", translationKey: string): Article {
  return { id, locale, translationKey, slug: `${id}-slug`, title: `Title ${id}` } as Article;
}

const lonelyEnglish = article("e1", "en", "k1");
const pairEnglish = article("e2", "en", "k2");
const pairItalian = article("i2", "it", "k2");
const lonelyItalian = article("i3", "it", "k3");
const all = { en: [lonelyEnglish, pairEnglish], it: [pairItalian, lonelyItalian] };

describe("translationChoices", () => {
  it("offers only the stories that have no article in the other language yet", () => {
    const { choices, selected } = translationChoices(all);
    expect(choices.en.map((choice) => choice.slug)).toEqual(["e1-slug"]);
    expect(choices.it.map((choice) => choice.slug)).toEqual(["i3-slug"]);
    expect(selected).toBe("");
  });

  it("keeps the current translation among the choices, selected, and never offers the article itself", () => {
    const { choices, selected } = translationChoices(all, pairItalian);
    expect(choices.en.map((choice) => choice.slug)).toEqual(["e1-slug", "e2-slug"]);
    expect(selected).toBe("e2-slug");
    expect(choices.it.map((choice) => choice.slug)).not.toContain("i2-slug");
  });

  it("offers every free story to an article that has no translation", () => {
    const { choices, selected } = translationChoices(all, lonelyItalian);
    expect(choices.en.map((choice) => choice.slug)).toEqual(["e1-slug"]);
    expect(selected).toBe("");
  });
});
