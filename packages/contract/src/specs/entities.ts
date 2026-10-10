import * as z from "zod/v4";

import { entityKinds, entityLimits } from "@atlasnews/core/editorial/domain/entity";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";

import { destructive, readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import { batchNote, editorialUnavailable, patchNote } from "./editorial";
import { batchOutput, entityOutputSchema, entitySlugSchema, localeSchema } from "./shared";

const kind = z.enum(entityKinds);
const name = z.string().trim().min(entityLimits.name.min).max(entityLimits.name.max);
const officialUrl = z.string().trim().max(entityLimits.officialUrl.max).regex(/^https:\/\/\S+$/, "Use an https URL");
const description = z.string().trim().min(entityLimits.description.min).max(entityLimits.description.max);

const createItem = z.object({
  kind,
  name,
  slug: entitySlugSchema.optional().describe("Defaults to the slug of the name. It names the entity for good."),
  officialUrl: officialUrl.nullable().optional().describe("The https page of the company, model or product."),
  parentSlug: entitySlugSchema.nullable().optional().describe("Slug of the company that a model or product belongs to."),
  descriptions: z.object({ en: description.optional(), it: description.optional() }).optional(),
});
const patchItem = z.object({
  slug: entitySlugSchema.describe("The entity to change. A slug is never renamed."),
  kind: kind.optional(),
  name: name.optional(),
  officialUrl: officialUrl.nullable().optional(),
  parentSlug: entitySlugSchema.nullable().optional(),
  descriptions: z.object({ en: description.nullable().optional(), it: description.nullable().optional() }).optional(),
});

const entityRecord = z.object({
  id: z.string(),
  kind,
  slug: z.string(),
  name: z.string(),
  officialUrl: z.string().nullable(),
  parent: z.object({ slug: z.string(), name: z.string() }).nullable(),
  descriptions: z.object({ en: z.string().optional(), it: z.string().optional() }),
});
const entityResult = z.object({ entity: entityRecord });
const entityBatchResult = (action: z.ZodType<string>) =>
  batchOutput(action, { slug: z.string() });

const shape =
  "An entity is a company, a model or a product, with one description per locale (en, it; either may be absent). "
  + "A company has no parent; a model or product may belong to one company.";
const patchSemantics =
  `${patchNote} Clearing: officialUrl null, parentSlug null, and a locale's description null remove them; name and kind cannot be cleared, only replaced. `
  + "The slug is never renamed.";
const deleteRule =
  "An entity that stories link, or that is the company of other entities, cannot be deleted; unlink or move them first.";

const base = { surfaces: ["mcp", "page"], unavailableMessage: editorialUnavailable } as const;

/** Public: the entities are already shown on the site. */
export const listEntities = defineSpec({
  name: "list_entities",
  title: "List AI companies, models and products",
  description:
    "List the companies, models and products that AtlasNews stories link, with their story counts, in English or Italian.",
  input: z.object({ locale: localeSchema, kind: kind.optional() }),
  output: z.object({
    items: z.array(entityOutputSchema.extend({ storyCount: z.number().int().nonnegative() })),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["mcp", "page"],
});

export const adminGetEntity = defineSpec({
  ...base,
  name: "admin_get_entity",
  title: "Get newsroom entity",
  description: `Get one entity with the descriptions of every locale. ${shape}`,
  input: z.object({ slug: entitySlugSchema }),
  output: entityResult,
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminCreateEntity = defineSpec({
  ...base,
  name: "admin_create_entity",
  title: "Create newsroom entity",
  description: `Create one entity. ${shape} It shows on the public site at once.`,
  input: createItem,
  output: entityResult,
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminUpdateEntity = defineSpec({
  ...base,
  name: "admin_update_entity",
  title: "Update newsroom entity",
  description: `Update one entity by slug. ${patchSemantics}`,
  input: patchItem,
  output: entityResult,
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminDeleteEntity = defineSpec({
  ...base,
  name: "admin_delete_entity",
  title: "Delete newsroom entity",
  description: `Permanently delete one entity and its descriptions. ${deleteRule}`,
  input: z.object({ slug: entitySlugSchema }),
  output: z.object({ deletedSlug: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ slug }) => `Permanently delete the entity “${slug}”?` },
});

export const adminCreateEntities = defineSpec({
  ...base,
  name: "admin_create_entities",
  title: "Create many newsroom entities",
  description:
    `Create several entities in one call; each item is shaped like admin_create_entity. A model or product may name a company created earlier in the same call.${batchNote("entities")}`,
  input: z.object({ items: z.array(createItem).min(1).max(batchLimit) }),
  output: entityBatchResult(z.literal("created")),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminUpdateEntities = defineSpec({
  ...base,
  name: "admin_update_entities",
  title: "Update many newsroom entities",
  description: `Update several entities in one call; each item is shaped like admin_update_entity. ${patchSemantics}${batchNote("entities")}`,
  input: z.object({ items: z.array(patchItem).min(1).max(batchLimit) }),
  output: entityBatchResult(z.literal("updated")),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminDeleteEntities = defineSpec({
  ...base,
  name: "admin_delete_entities",
  title: "Delete many newsroom entities",
  description: `Permanently delete several entities. ${deleteRule} A company may be deleted together with its own models and products.${batchNote("entities")}`,
  input: z.object({ slugs: z.array(entitySlugSchema).min(1).max(batchLimit) }),
  output: entityBatchResult(z.literal("deleted")),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: {
    question: ({ slugs }) => `Permanently delete ${slugs.length} entit${slugs.length === 1 ? "y" : "ies"}: ${slugs.join(", ")}?`,
  },
});

export const entitySpecs = [
  listEntities,
  adminGetEntity,
  adminCreateEntity,
  adminUpdateEntity,
  adminDeleteEntity,
  adminCreateEntities,
  adminUpdateEntities,
  adminDeleteEntities,
] as const;
