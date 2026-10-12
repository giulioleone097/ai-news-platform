import { afterEach, describe, expect, it } from "vitest";
import { checkFill, openArticleForm, registerOpenArticleForm, type FillOptions, type OpenArticleForm } from "./article-form-bridge";

const form = (): OpenArticleForm => ({
  read: () => {
    throw new Error("not read here");
  },
  fill: () => ({ filled: [], rejected: [], saved: false }),
});

describe("the open article form", () => {
  afterEach(() => {
    while (openArticleForm()) registerOpenArticleForm(form())();
  });

  it("is the form that registered last, and is gone when it unregisters", () => {
    expect(openArticleForm()).toBeNull();
    const first = form();
    const second = form();
    const leaveFirst = registerOpenArticleForm(first);
    expect(openArticleForm()).toBe(first);
    const leaveSecond = registerOpenArticleForm(second);
    expect(openArticleForm()).toBe(second);

    // A form that was replaced cannot take its successor away when it unmounts late.
    leaveFirst();
    expect(openArticleForm()).toBe(second);
    leaveSecond();
    expect(openArticleForm()).toBeNull();
  });
});

describe("checkFill", () => {
  const options: FillOptions = {
    categories: ["models", "research"],
    translations: ["gpt-lancio"],
    entities: ["openai", "anthropic"],
  };

  it("takes every field that the form can hold and lists them in the order given", () => {
    const patch = {
      title: "A title",
      categorySlug: "research",
      translationOf: "gpt-lancio",
      entities: [{ slug: "openai", isPrimary: true }],
      featured: false,
    };
    expect(checkFill(patch, options)).toEqual({ accepted: patch, filled: Object.keys(patch), rejected: [] });
  });

  it("refuses a category, a translation or an entity that the form does not offer, and says what it does", () => {
    const { accepted, filled, rejected } = checkFill(
      { title: "A title", categorySlug: "cooking", translationOf: "other", entities: [{ slug: "openai" }, { slug: "nobody" }] },
      options,
    );
    expect(filled).toEqual(["title"]);
    expect(accepted).toEqual({ title: "A title" });
    expect(rejected.map((entry) => entry.field)).toEqual(["categorySlug", "translationOf", "entities"]);
    expect(rejected[0].reason).toBe('No category "cooking" in this article\'s locale. Categories: models, research.');
    expect(rejected[1].reason).toContain("gpt-lancio");
    expect(rejected[2].reason).toBe("Unknown entities: nobody. The list was left as it was.");
  });

  it("lets the person's links be removed, and an empty list empty an entity link", () => {
    const patch = { translationOf: null, entities: [], coverImage: null, scheduledFor: null };
    expect(checkFill(patch, options)).toMatchObject({ filled: ["translationOf", "entities", "coverImage", "scheduledFor"], rejected: [] });
  });

  it("does not list a field that was not given", () => {
    expect(checkFill({}, options)).toEqual({ accepted: {}, filled: [], rejected: [] });
    expect(checkFill({ title: undefined }, options).filled).toEqual([]);
  });

  it("names a part of a long list and the number left out", () => {
    const many = Array.from({ length: 15 }, (_, index) => `category-${index}`);
    const { rejected } = checkFill({ categorySlug: "none" }, { ...options, categories: many });
    expect(rejected[0].reason).toContain("category-11, and 3 more");
    expect(checkFill({ translationOf: "x" }, { ...options, translations: [] }).rejected[0].reason).toContain("none");
  });
});
