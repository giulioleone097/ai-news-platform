import { describe, expect, it } from "vitest";
import {
  estimateReadingMinutes,
  parseArticleSections,
  slugify,
} from "./article";

describe("article domain", () => {
  it("creates stable ASCII slugs from Italian titles", () => {
    expect(slugify("L’intelligenza è già qui!")).toBe("l-intelligenza-e-gia-qui");
  });

  it("never reports less than one reading minute", () => {
    expect(estimateReadingMinutes("Testo breve")).toBe(1);
    expect(estimateReadingMinutes(Array.from({ length: 421 }, () => "parola").join(" "))).toBe(3);
  });

  it("parses lightweight editorial sections", () => {
    const sections = parseArticleSections("Intro.\n\n## Sezione\n\nPrimo.\n\nSecondo.");

    expect(sections).toEqual([
      { heading: null, paragraphs: ["Intro."] },
      { heading: "Sezione", paragraphs: ["Primo.", "Secondo."] },
    ]);
  });
});
