import { describe, expect, it, vi } from "vitest";

import type { CategoryRecord } from "@atlasnews/core/editorial/domain/category";
import type { Category } from "@atlasnews/core/editorial/domain/article";

import { anonymous } from "../capability";
import { capabilities } from "../catalogue";
import { siteLinks, type CapabilityPorts } from "../ports";

const english: Category = { id: "c-en", translationKey: "research", locale: "en", slug: "research", name: "Research", description: "" };
const records: CategoryRecord[] = [
  {
    translationKey: "research",
    position: 3,
    translations: {
      en: { id: "c-en", slug: "research", name: "Research", description: "" },
      it: { id: "c-it", slug: "ricerca", name: "Ricerca", description: "Appunti" },
    },
  },
];

describe("admin_list_categories", () => {
  it("returns the position and both locales of every category in one call", async () => {
    const unavailable = async (): Promise<never> => {
      throw new Error("not configured");
    };
    const listCategories = vi.fn(async () => [english]);
    const listCategoryRecords = vi.fn(async () => records);
    const ports = {
      site: siteLinks(new URL("https://atlasnews.example")),
      articles: unavailable,
      entities: unavailable,
      invalidateCache: vi.fn(async () => undefined),
      editorial: async () => ({ listCategories, listCategoryRecords }),
      publicComments: unavailable,
      moderation: unavailable,
      commentNotifications: unavailable,
      newsletter: unavailable,
      contact: unavailable,
      social: unavailable,
    } as unknown as CapabilityPorts;

    const capability = capabilities.find((item) => item.name === "admin_list_categories")!;
    const result = capability.output.parse(await capability.run(ports, capability.input.parse({ locale: "en" }), anonymous));

    expect(result).toEqual({ categories: [{ ...english, position: 3, translations: records[0]!.translations }] });
    expect(listCategories).toHaveBeenCalledTimes(1);
  });
});
