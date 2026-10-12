import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getSupabaseEnvironment: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@atlasnews/adapters/config/env", () => ({
  getContentMode: () => "supabase",
  getSupabaseEnvironment: mocks.getSupabaseEnvironment,
}));

import { proxy } from "./proxy";

describe("proxy authentication refresh", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.getSupabaseEnvironment.mockReset();
    mocks.getSupabaseEnvironment.mockReturnValue({
      url: "https://example.supabase.co",
      anonKey: "test-anon-key",
    });
    mocks.createServerClient.mockReset();
    mocks.createServerClient.mockReturnValue({
      auth: { getClaims: mocks.getClaims },
    });
  });

  it("verifies auth-sensitive requests with getClaims", async () => {
    const response = await proxy(new NextRequest("https://atlasnews.test/en/studio"));

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).toHaveBeenCalledOnce();
    expect(mocks.getClaims).toHaveBeenCalledOnce();
  });

  it("leaves the OAuth consent page where it is and refreshes the session for it", async () => {
    const response = await proxy(new NextRequest("https://atlasnews.test/oauth/consent?authorization_id=x"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(isRewrite(response)).toBe(false);
    expect(mocks.createServerClient).toHaveBeenCalledOnce();
    expect(mocks.getClaims).toHaveBeenCalledOnce();
  });

  it("does not swallow a claims verification failure", async () => {
    mocks.getClaims.mockRejectedValueOnce(new Error("claims verification unavailable"));

    await expect(
      proxy(new NextRequest("https://atlasnews.test/en/studio")),
    ).rejects.toThrow("claims verification unavailable");
  });

  it("keeps public routes free from Supabase auth work", async () => {
    const response = await proxy(new NextRequest("https://atlasnews.test/en/latest"));

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});

describe("proxy framing policy", () => {
  beforeEach(() => {
    mocks.getSupabaseEnvironment.mockReset();
    mocks.getSupabaseEnvironment.mockReturnValue(null);
  });

  it("denies framing of sign-in, Studio and OAuth consent, including their redirects", async () => {
    for (const path of ["/oauth/consent", "/en/login", "/it/login", "/en/studio", "/it/studio/newsletter", "/en/auth/callback"]) {
      const response = await proxy(new NextRequest(`https://atlasnews.test${path}`));
      expect(response.headers.get("x-frame-options"), path).toBe("DENY");
    }
    // /studio without a locale is redirected to the default locale first; the redirect is not framable content.
    const redirect = await proxy(new NextRequest("https://atlasnews.test/studio"));
    expect(redirect.status).toBe(307);
  });

  it("leaves public pages to the general rule", async () => {
    for (const path of ["/en", "/en/latest", "/en/articles/a-story", "/en/loginfo"]) {
      const response = await proxy(new NextRequest(`https://atlasnews.test${path}`));
      expect(response.headers.get("x-frame-options"), path).toBeNull();
    }
  });
});

describe("proxy locale redirect", () => {
  beforeEach(() => {
    mocks.getSupabaseEnvironment.mockReset();
    mocks.getSupabaseEnvironment.mockReturnValue(null);
  });

  const visit = (path: string, acceptLanguage?: string) => proxy(new NextRequest(
    `https://atlasnews.test${path}`,
    acceptLanguage ? { headers: { "accept-language": acceptLanguage } } : undefined,
  ));

  it("sends / to the language the browser prefers, temporarily", async () => {
    const italian = await visit("/", "it-IT,it;q=0.9,en;q=0.8");
    expect(italian.status).toBe(307);
    expect(italian.headers.get("location")).toBe("https://atlasnews.test/it");
    expect(italian.headers.get("vary")).toContain("Accept-Language");

    const english = await visit("/", "en-US,en;q=0.9");
    expect(english.headers.get("location")).toBe("https://atlasnews.test/en");
  });

  it("falls back to English without a usable header and keeps the rest of the path and the query", async () => {
    expect((await visit("/")).headers.get("location")).toBe("https://atlasnews.test/en");
    expect((await visit("/", "de")).headers.get("location")).toBe("https://atlasnews.test/en");

    const deep = await visit("/latest?page=2", "it");
    expect(deep.headers.get("location")).toBe("https://atlasnews.test/it/latest?page=2");
  });

  it("leaves prefixed routes alone whatever the browser prefers", async () => {
    const response = await visit("/en/latest", "it");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("proxy agent-facing rewrites", () => {
  beforeEach(() => {
    mocks.createServerClient.mockReset();
  });

  it.each([
    ["/en/articles/ai-agents-enter-everyday-work.md", "https://atlasnews.test/en/md/articles/ai-agents-enter-everyday-work"],
    ["/it/entities/openai.md", "https://atlasnews.test/it/md/entities/openai"],
    ["/en/entities/openai/feed.xml", "https://atlasnews.test/en/entity-feed/openai"],
  ])("rewrites %s to its route handler without Supabase work", async (path, destination) => {
    const response = await proxy(new NextRequest(`https://atlasnews.test${path}`));

    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe(destination);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it.each([
    "/en/articles/Not_A_Slug.md",
    "/fr/articles/ai-agents.md",
    "/en/entities/openai/feed.json",
  ])("leaves %s on the normal route", async (path) => {
    const response = await proxy(new NextRequest(`https://atlasnews.test${path}`));

    expect(isRewrite(response)).toBe(false);
  });
});
