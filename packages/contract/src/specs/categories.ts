import * as z from "zod/v4";

import { categoryLimits } from "@atlasnews/core/editorial/domain/category";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";

import { destructive, readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import {
  batchNote,
  editorialUnavailable,
  editorLocaleSchema,
  patchNote,
} from "./editorial";
import { batchOutput, categorySlugSchema, perLocale } from "./shared";

const keySchema = z.string().trim().min(1).max(categoryLimits.slug.max)
  .describe("Translation key of the category: the English slug it was created with. It never changes.");
const positionSchema = z.number().int().min(0).max(categoryLimits.position.max);

const name = z.string().trim().min(categoryLimits.name.min).max(categoryLimits.name.max);
const description = z.string().trim().max(categoryLimits.description.max);

const createText = z.object({
  name,
  slug: categorySlugSchema.optional().describe("Defaults to the slug of the name."),
  description: description.optional(),
});
const patchText = z.object({
  name: name.optional(),
  slug: categorySlugSchema.optional(),
  description: description.optional(),
});

const createItem = z.object({
  translations: perLocale(createText).describe("Both locales are required: every locale of the site lists its categories."),
  position: positionSchema.optional().describe("Order on the site; defaults to after the last category."),
});
const patchItem = z.object({
  translationKey: keySchema,
  position: positionSchema.optional(),
  translations: z.object({ en: patchText.optional(), it: patchText.optional() }).optional(),
});

const translationOutput = z.object({ id: z.string(), slug: z.string(), name: z.string(), description: z.string() });
const categoryRecord = z.object({
  translationKey: z.string(),
  position: z.number().int(),
  translations: z.object({ en: translationOutput.optional(), it: translationOutput.optional() }),
});
const categoryResult = z.object({ category: categoryRecord });
const categoryBatchResult = (action: z.ZodType<string>) =>
  batchOutput(action, { translationKey: z.string() });

const shape =
  "A category is bilingual: one translation key (the English slug at creation, never changed) and one row per locale, "
  + "each with a slug, a name and a description. Slugs are unique per locale.";
const patchSemantics =
  `${patchNote} Only the locales you list change. Clearing: description "" empties it; name, slug and position cannot be cleared, only replaced.`;
const deleteRule = "A category that articles still use cannot be deleted; move its articles first.";

const base = { surfaces: ["mcp", "page"], unavailableMessage: editorialUnavailable } as const;

const categoryListItem = z.object({
  id: z.string(),
  translationKey: z.string(),
  locale: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  position: z.number().int(),
  translations: categoryRecord.shape.translations,
});

export const adminListCategories = defineSpec({
  ...base,
  name: "admin_list_categories",
  title: "List newsroom categories",
  description:
    "List valid editorial categories in site order. Each item is the category in the requested locale "
    + "(slug, name, description) with its position and both of its locales under `translations`, so no second call is needed.",
  input: z.object({ locale: editorLocaleSchema }),
  output: z.object({ categories: z.array(categoryListItem) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminGetCategory = defineSpec({
  ...base,
  name: "admin_get_category",
  title: "Get newsroom category",
  description: `Get one category with both of its locales. ${shape}`,
  input: z.object({ translationKey: keySchema }),
  output: categoryResult,
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminCreateCategory = defineSpec({
  ...base,
  name: "admin_create_category",
  title: "Create newsroom category",
  description: `Create one category with both locales. ${shape} It shows on the public site at once.`,
  input: createItem,
  output: categoryResult,
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminUpdateCategory = defineSpec({
  ...base,
  name: "admin_update_category",
  title: "Update newsroom category",
  description: `Update one category by translation key. ${patchSemantics}`,
  input: patchItem,
  output: categoryResult,
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminDeleteCategory = defineSpec({
  ...base,
  name: "admin_delete_category",
  title: "Delete newsroom category",
  description: `Permanently delete one category in every locale. ${deleteRule}`,
  input: z.object({ translationKey: keySchema }),
  output: z.object({ deletedKey: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ translationKey }) => `Permanently delete the category “${translationKey}” in every locale?` },
});

export const adminCreateCategories = defineSpec({
  ...base,
  name: "admin_create_categories",
  title: "Create many newsroom categories",
  description: `Create several categories in one call; each item is shaped like admin_create_category.${batchNote("categories")}`,
  input: z.object({ items: z.array(createItem).min(1).max(batchLimit) }),
  output: categoryBatchResult(z.literal("created")),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminUpdateCategories = defineSpec({
  ...base,
  name: "admin_update_categories",
  title: "Update many newsroom categories",
  description: `Update several categories in one call; each item is shaped like admin_update_category. ${patchSemantics}${batchNote("categories")}`,
  input: z.object({ items: z.array(patchItem).min(1).max(batchLimit) }),
  output: categoryBatchResult(z.literal("updated")),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminDeleteCategories = defineSpec({
  ...base,
  name: "admin_delete_categories",
  title: "Delete many newsroom categories",
  description: `Permanently delete several categories in every locale. ${deleteRule}${batchNote("categories")}`,
  input: z.object({ translationKeys: z.array(keySchema).min(1).max(batchLimit) }),
  output: categoryBatchResult(z.literal("deleted")),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: {
    question: ({ translationKeys }) =>
      `Permanently delete ${translationKeys.length} categor${translationKeys.length === 1 ? "y" : "ies"} in every locale: ${translationKeys.join(", ")}?`,
  },
});

export const categorySpecs = [
  adminListCategories,
  adminGetCategory,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminCreateCategories,
  adminUpdateCategories,
  adminDeleteCategories,
] as const;
