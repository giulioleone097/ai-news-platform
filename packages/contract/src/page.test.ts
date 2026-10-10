import { describe, expect, it } from "vitest";

import { pageCapabilities, parsePageInput } from "./page";

describe("parsePageInput", () => {
  it("accepts what the published schema accepts and applies its defaults", () => {
    expect(parsePageInput("open_article", { slug: "gpt-launch" })).toEqual({
      ok: true,
      input: { locale: "en", slug: "gpt-launch" },
    });
    expect(parsePageInput("search_articles", { query: "agents" })).toMatchObject({
      ok: true,
      input: { locale: "en", query: "agents", limit: 10 },
    });
    expect(parsePageInput("read_open_article", undefined)).toEqual({ ok: true, input: {} });
  });

  it("names the failing field and the tool when the arguments are invalid", () => {
    const missing = parsePageInput("open_article", { locale: "en" });
    expect(missing).toMatchObject({ ok: false });
    expect(missing.ok === false && missing.error).toMatch(/open_article.*slug/);

    const tooShort = parsePageInput("search_articles", { query: "a" });
    expect(tooShort.ok).toBe(false);
    expect(parsePageInput("filter_feed", { claimStatus: "maybe" }).ok).toBe(false);
    expect(parsePageInput("save_article", { slug: "Not A Slug" }).ok).toBe(false);
  });

  it("offers no argument that the site cannot honour", () => {
    const filter = pageCapabilities.find((capability) => capability.name === "filter_feed")!;
    expect(Object.keys(filter.inputSchema.properties as object).sort()).toEqual(["claimStatus", "entity", "locale"]);
  });
});
