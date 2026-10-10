import { locales } from "@atlasnews/core/locale";
import { CategoryCommandService } from "@atlasnews/core/editorial/application/category-commands";

import { CapabilityFailure, implement } from "../capability";
import type { CapabilityPorts } from "../ports";
import {
  adminCreateCategories,
  adminCreateCategory,
  adminDeleteCategories,
  adminDeleteCategory,
  adminGetCategory,
  adminListCategories,
  adminUpdateCategories,
  adminUpdateCategory,
} from "../specs/categories";

async function categories(ports: CapabilityPorts) {
  const repository = await ports.editorial();
  return { repository, commands: new CategoryCommandService(repository) };
}

/** Categories show in the navigation of every locale, so any write refreshes all of them. */
async function refresh(ports: CapabilityPorts) {
  for (const locale of locales) await ports.invalidateCache({ locale, slugs: [] });
}

function batchResult<A extends string>(action: A, keys: readonly string[]) {
  return { count: keys.length, items: keys.map((translationKey, index) => ({ index, action, translationKey })) };
}

export const categoryCapabilities = [
  implement(adminListCategories, async (ports, { locale }) => ({
    categories: (await (await ports.editorial()).listCategories(locale)).map((category) => ({ ...category })),
  })),

  implement(adminGetCategory, async (ports, { translationKey }) => {
    const { repository } = await categories(ports);
    const category = (await repository.listCategoryRecords()).find((record) => record.translationKey === translationKey);
    if (!category) throw new CapabilityFailure("Category not found.");
    return { category };
  }),

  implement(adminCreateCategory, async (ports, input) => {
    const { commands } = await categories(ports);
    const category = await commands.createOne(input);
    await refresh(ports);
    return { category };
  }),

  implement(adminUpdateCategory, async (ports, input) => {
    const { commands } = await categories(ports);
    const category = await commands.updateOne(input);
    await refresh(ports);
    return { category };
  }),

  implement(adminDeleteCategory, async (ports, { translationKey }) => {
    const { commands } = await categories(ports);
    await commands.deleteOne(translationKey);
    await refresh(ports);
    return { deletedKey: translationKey };
  }),

  implement(adminCreateCategories, async (ports, { items }) => {
    const { commands } = await categories(ports);
    const created = await commands.createMany(items);
    await refresh(ports);
    return batchResult("created", created.map((record) => record.translationKey));
  }),

  implement(adminUpdateCategories, async (ports, { items }) => {
    const { commands } = await categories(ports);
    const updated = await commands.updateMany(items);
    await refresh(ports);
    return batchResult("updated", updated.map((record) => record.translationKey));
  }),

  implement(adminDeleteCategories, async (ports, { translationKeys }) => {
    const { commands } = await categories(ports);
    await commands.deleteMany(translationKeys);
    await refresh(ports);
    return batchResult("deleted", translationKeys);
  }),
];
