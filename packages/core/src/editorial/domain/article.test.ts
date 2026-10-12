import { describe, expect, it } from "vitest";
import {
  currentCoverImage,
  defaultCoverImage,
  estimateReadingMinutes,
  formatArticleStatus,
  normalizeStoryFields,
  slugify,
  StoryFieldError,
} from "./article";
import { defaultLocale, isLocale, locales } from "../../locale";

describe("article domain", () => {
  it("creates stable ASCII slugs from Italian titles", () => {
    expect(slugify("L’intelligenza è già qui!")).toBe("l-intelligenza-e-gia-qui");
  });

  it("never reports less than one reading minute", () => {
    expect(estimateReadingMinutes("Testo breve")).toBe(1);
    expect(estimateReadingMinutes(Array.from({ length: 421 }, () => "parola").join(" "))).toBe(3);
  });

  it("keeps the supported locales English-first", () => {
    expect(defaultLocale).toBe("en");
    expect(locales).toEqual(["en", "it"]);
    expect(isLocale("it")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(formatArticleStatus("review", "en")).toBe("In review");
    expect(formatArticleStatus("review", "it")).toBe("In revisione");
  });
});

describe("story fields", () => {
  const source = { title: "Official announcement", url: "https://example.com/post", supports: "The product exists." };
  const field = (call: () => unknown) => {
    try {
      call();
    } catch (error) {
      return error instanceof StoryFieldError ? error.field : "other";
    }
    return "none";
  };

  it("leaves absent fields absent so a save keeps the stored value", () => {
    expect(normalizeStoryFields({})).toEqual({});
  });

  it("trims what it accepts and keeps the source order", () => {
    const second = { ...source, title: "  Second source " };
    expect(normalizeStoryFields({
      claimStatus: "rumour",
      keyPoints: ["  First point "],
      sources: [source, second],
    })).toEqual({
      claimStatus: "rumour",
      keyPoints: ["First point"],
      sources: [source, { ...source, title: "Second source" }],
    });
  });

  it("limits key points to three lines of 3 to 140 characters", () => {
    const point = "A short line";
    expect(normalizeStoryFields({ keyPoints: [point, point, point] }).keyPoints).toHaveLength(3);
    expect(field(() => normalizeStoryFields({ keyPoints: [point, point, point, point] }))).toBe("keyPoints");
    expect(field(() => normalizeStoryFields({ keyPoints: ["no"] }))).toBe("keyPoints");
    expect(field(() => normalizeStoryFields({ keyPoints: ["   "] }))).toBe("keyPoints");
    expect(field(() => normalizeStoryFields({ keyPoints: ["x".repeat(141)] }))).toBe("keyPoints");
    expect(normalizeStoryFields({ keyPoints: ["x".repeat(140)] }).keyPoints).toHaveLength(1);
  });

  it("accepts https sources only, without credentials", () => {
    for (const url of [
      "http://example.com/post",
      "javascript:alert(1)",
      "ftp://example.com/file",
      "//example.com/post",
      "https://user:secret@example.com/post",
      "https://example.com/a b",
      "not a url",
      `https://example.com/${"a".repeat(2048)}`,
    ]) {
      expect(field(() => normalizeStoryFields({ sources: [{ ...source, url }] })), url).toBe("sources");
    }
    expect(normalizeStoryFields({ sources: [{ ...source, url: "https://example.com" }] }).sources?.[0].url)
      .toBe("https://example.com");
  });

  it("limits the count and the text of sources", () => {
    expect(normalizeStoryFields({ sources: Array.from({ length: 10 }, () => source) }).sources).toHaveLength(10);
    expect(field(() => normalizeStoryFields({ sources: Array.from({ length: 11 }, () => source) }))).toBe("sources");
    expect(field(() => normalizeStoryFields({ sources: [{ ...source, title: "ab" }] }))).toBe("sources");
    expect(field(() => normalizeStoryFields({ sources: [{ ...source, supports: "" }] }))).toBe("sources");
    expect(field(() => normalizeStoryFields({ sources: [{ ...source, supports: "x".repeat(241) }] }))).toBe("sources");
  });

  it("rejects an unknown claim status", () => {
    expect(field(() => normalizeStoryFields({ claimStatus: "official" as never }))).toBe("claimStatus");
  });

  it("resolves exactly one primary entity and rejects duplicates and excess", () => {
    expect(normalizeStoryFields({ entities: [{ slug: "claude" }, { slug: "anthropic" }] }).entities).toEqual([
      { slug: "claude", isPrimary: true },
      { slug: "anthropic", isPrimary: false },
    ]);
    expect(normalizeStoryFields({
      entities: [{ slug: "claude" }, { slug: "anthropic", isPrimary: true }],
    }).entities?.map((link) => link.isPrimary)).toEqual([false, true]);
    expect(normalizeStoryFields({ entities: [] }).entities).toEqual([]);
    expect(field(() => normalizeStoryFields({
      entities: [{ slug: "claude", isPrimary: true }, { slug: "anthropic", isPrimary: true }],
    }))).toBe("entities");
    expect(field(() => normalizeStoryFields({ entities: [{ slug: "claude" }, { slug: "claude" }] }))).toBe("entities");
    expect(field(() => normalizeStoryFields({ entities: [{ slug: "Not A Slug" }] }))).toBe("entities");
    expect(field(() => normalizeStoryFields({
      entities: Array.from({ length: 9 }, (_, index) => ({ slug: `entity-${index}` })),
    }))).toBe("entities");
  });

  it("reads the cover stored under the retired NEURA name as the current default", () => {
    expect(currentCoverImage("/media/neura-agents-hero.webp")).toBe(defaultCoverImage);
    expect(currentCoverImage("/media/own-cover.webp")).toBe("/media/own-cover.webp");
  });
});
