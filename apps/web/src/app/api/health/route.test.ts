import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSitesBindings } from "@atlasnews/adapters/sites/bindings";

import { GET } from "./route";

beforeEach(() => {
  setSitesBindings({ DB: {}, BUCKET: {} });
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ATLASNEWS_CONTENT_MODE", "sites");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
});
afterEach(() => {
  setSitesBindings(null);
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("lists the missing client address header as a warning and keeps the status of the blocking checks", async () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "");
    const without = await GET();
    expect((await without.json()).warnings).toEqual(["client-address-header"]);

    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "cf-connecting-ip");
    const configured = await GET();
    expect((await configured.json()).warnings).toEqual([]);
    expect(without.status).toBe(configured.status);
  });
});
