import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));

import { articlesCacheTag, invalidatePublicEditorialCache } from "./editorial-cache";

describe("public editorial cache invalidation", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear();
    mocks.revalidateTag.mockClear();
  });

  it("expires tagged data and every public delivery route immediately", () => {
    invalidatePublicEditorialCache({
      locale: "it",
      slugs: ["vecchio-slug", "nuovo-slug", "nuovo-slug"],
    });

    expect(mocks.revalidateTag).toHaveBeenCalledWith(articlesCacheTag, { expire: 0 });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/it"],
      ["/it/latest"],
      ["/it/search"],
      ["/it/articles/[slug]", "page"],
      ["/it/categories/[slug]", "page"],
      ["/it/articles/vecchio-slug"],
      ["/it/articles/nuovo-slug"],
      ["/api/articles"],
      ["/it/feed.xml"],
      ["/sitemap.xml"],
    ]);
  });
});
