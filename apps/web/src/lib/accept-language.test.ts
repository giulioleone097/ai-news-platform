import { describe, expect, it } from "vitest";
import { preferredLocale } from "./accept-language";

describe("preferredLocale", () => {
  it.each([
    ["it-IT,it;q=0.9,en;q=0.8", "it"],
    ["en-US,en;q=0.9,it;q=0.8", "en"],
    ["it", "it"],
    ["IT-it", "it"],
    ["fr-FR,fr;q=0.9,it;q=0.5", "it"],
    ["en;q=0.4, it;q=0.8", "it"],
    ["it;q=0.8, en;q=0.8", "it"],
  ])("takes %s as %s", (header, expected) => {
    expect(preferredLocale(header)).toBe(expected);
  });

  it.each([null, undefined, "", "*", "de,fr;q=0.8", "it;q=0, en;q=0", "it;q=abc", "it;q=1.5x"])(
    "falls back to the default language for %j",
    (header) => {
      expect(preferredLocale(header)).toBe("en");
    },
  );
});
