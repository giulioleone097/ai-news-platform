import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn() }));

vi.mock("@/lib/editorial-cache", () => ({ invalidatePublicEditorialCache: mocks.invalidate }));

import { POST } from "./route";

const secret = "r".repeat(40);

function call(authorization?: string, body: unknown = { locale: "en", slugs: ["a-story"] }) {
  return POST(new Request("https://news.example.com/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

beforeEach(() => {
  mocks.invalidate.mockClear();
  vi.stubEnv("NEURA_REVALIDATE_SECRET", secret);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/revalidate", () => {
  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("NEURA_REVALIDATE_SECRET", "");
    expect((await call(`Bearer ${secret}`)).status).toBe(503);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"w".repeat(40)}`)).status).toBe(401);
    expect((await call(secret)).status).toBe(401);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("invalidates the public cache for the right secret", async () => {
    const response = await call(`Bearer ${secret}`, { locale: "it", slugs: ["vecchio", "nuovo"] });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.invalidate).toHaveBeenCalledWith({ locale: "it", slugs: ["vecchio", "nuovo"] });
  });

  it("rejects malformed bodies after authenticating", async () => {
    expect((await call(`Bearer ${secret}`, "not json")).status).toBe(400);
    expect((await call(`Bearer ${secret}`, { locale: "fr", slugs: [] })).status).toBe(400);
    expect((await call(`Bearer ${secret}`, { locale: "en", slugs: ["Bad Slug"] })).status).toBe(400);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
