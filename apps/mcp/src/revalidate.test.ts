import { describe, expect, it, vi } from "vitest";

import { createWebCacheInvalidator } from "./revalidate";

const origin = new URL("https://news.example.com");
const secret = "s".repeat(40);

describe("web cache invalidator", () => {
  it("posts the invalidation to the reader site with the shared secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await createWebCacheInvalidator({ origin, secret, fetchImpl })({ locale: "it", slugs: ["a", "b", "a"] });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://news.example.com/api/revalidate");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${secret}`);
    expect(JSON.parse(init.body)).toEqual({ locale: "it", slugs: ["a", "b"] });
  });

  it("does nothing without a secret", async () => {
    const fetchImpl = vi.fn();
    await createWebCacheInvalidator({ origin, secret: "", fetchImpl })({ locale: "en", slugs: ["a"] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never fails the edit when the site is unreachable or refuses", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unreachable = vi.fn().mockRejectedValue(new Error("down"));
    const refused = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(createWebCacheInvalidator({ origin, secret, fetchImpl: unreachable })({ locale: "en", slugs: [] })).resolves.toBeUndefined();
    await expect(createWebCacheInvalidator({ origin, secret, fetchImpl: refused })({ locale: "en", slugs: [] })).resolves.toBeUndefined();
  });
});
