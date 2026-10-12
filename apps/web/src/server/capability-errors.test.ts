import { describe, expect, it } from "vitest";
import { operationErrorCodes } from "@atlasnews/contract";
import { editorialErrorCodes } from "@atlasnews/core/editorial/domain/errors";
import { getMessages, locales } from "@/i18n";
import { failureText, ruleErrorText } from "./capability-errors";

const codes = [...editorialErrorCodes, ...operationErrorCodes];

/** The `{name}` placeholders a catalogue entry uses, over both plural forms. */
function placeholders(text: string | { one: string; other: string }) {
  const forms = typeof text === "string" ? [text] : [text.one, text.other];
  return [...new Set(forms.flatMap((form) => [...form.matchAll(/\{(\w+)\}/g)].map((match) => match[1])))].sort();
}

describe("rule error texts", () => {
  it("has a text for every error code in English and in Italian, and none for a code that does not exist", () => {
    for (const locale of locales) {
      const { ruleErrors } = getMessages(locale).studio;
      expect(Object.keys(ruleErrors).sort(), locale).toEqual([...codes].sort());
    }
  });

  it("uses the same values in both languages for every code, so no value is dropped from one", () => {
    const en = getMessages("en").studio.ruleErrors;
    const it = getMessages("it").studio.ruleErrors;
    for (const code of codes) {
      expect(placeholders(it[code]), code).toEqual(placeholders(en[code]));
    }
  });

  it("has both plural forms wherever one is given", () => {
    for (const locale of locales) {
      for (const code of codes) {
        const text: unknown = getMessages(locale).studio.ruleErrors[code];
        if (typeof text === "string") continue;
        expect(text, `${locale} ${code}`).toEqual({ one: expect.stringContaining("{count}"), other: expect.stringContaining("{count}") });
      }
    }
  });
});

describe("ruleErrorText", () => {
  it("fills in the values of the failure and names a language in the editor's own", () => {
    expect(ruleErrorText("it", "article.slugTaken", { slug: "ciao", locale: "it" }))
      .toBe("Lo slug “ciao” è già usato da un altro articolo in italiano.");
    expect(ruleErrorText("en", "article.slugTaken", { slug: "hello", locale: "it" }))
      .toBe("The slug “hello” is already used by another Italian article.");
  });

  it("picks the singular or the plural form by the count", () => {
    expect(ruleErrorText("it", "category.inUse", { key: "politics", count: 1 })).toContain("1 articolo");
    expect(ruleErrorText("it", "category.inUse", { key: "politics", count: 3 })).toContain("3 articoli");
    expect(ruleErrorText("en", "category.inUse", { key: "politics", count: 1 })).toContain("1 article.");
    expect(ruleErrorText("en", "category.inUse", { key: "politics", count: 3 })).toContain("3 articles.");
  });

  it("leaves a placeholder visible rather than printing undefined when a value is missing", () => {
    expect(ruleErrorText("en", "article.slugTaken", { locale: "en" })).toContain("{slug}");
  });
});

describe("failureText", () => {
  it("shows the text of the code, and a plain refusal for a failure without one, never the English message", () => {
    expect(failureText("it", { code: "entity.notFound" })).toBe(getMessages("it").studio.ruleErrors["entity.notFound"]);
    expect(failureText("it", {})).toBe(getMessages("it").studio.refusals.refused);
  });

  it("writes a rejected batch as its count and each item's own text", () => {
    const text = failureText("it", {
      issues: [
        { index: 0, label: "ciao", message: "Article not found.", code: "article.notFound" },
        { index: 2, message: "Something else.", code: undefined },
      ],
    });
    expect(text).toContain("2 elementi non sono validi");
    expect(text).toContain("#0 (ciao): Articolo non trovato");
    expect(text).toContain(`#2: ${getMessages("it").studio.refusals.refused}`);
    expect(text).not.toMatch(/not found|Something else/i);
  });
});
