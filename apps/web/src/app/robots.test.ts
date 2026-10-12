import { describe, expect, it, vi } from "vitest";

vi.mock("@atlasnews/adapters/config/env", () => ({ getPublicSiteUrl: () => "https://news.example.com" }));

import robots from "./robots";

describe("robots.txt", () => {
  it("keeps every crawler out of the Studio, sign-in, API and OAuth pages", () => {
    const rules = [robots().rules].flat();

    expect(rules.length).toBeGreaterThan(1);
    for (const rule of rules) {
      expect(rule.allow).toBe("/");
      expect(rule.disallow).toEqual(expect.arrayContaining([
        "/en/studio", "/it/studio", "/en/login", "/it/login", "/en/auth", "/it/auth", "/api/", "/oauth/",
      ]));
    }
  });

  it("lists both sitemaps", () => {
    expect(robots().sitemap).toEqual([
      "https://news.example.com/sitemap.xml",
      "https://news.example.com/news-sitemap.xml",
    ]);
  });
});
