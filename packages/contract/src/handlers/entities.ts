import { locales } from "@atlasnews/core/locale";
import { EntityCommandService } from "@atlasnews/core/editorial/application/entity-commands";

import { CapabilityFailure, implement } from "../capability";
import type { CapabilityPorts } from "../ports";
import {
  adminCreateEntities,
  adminCreateEntity,
  adminDeleteEntities,
  adminDeleteEntity,
  adminGetEntity,
  adminUpdateEntities,
  adminUpdateEntity,
} from "../specs/entities";

async function entities(ports: CapabilityPorts) {
  const repository = await ports.editorial();
  return { repository, commands: new EntityCommandService(repository) };
}

/** Entities show on the story pages and the entity pages of every locale. */
async function refresh(ports: CapabilityPorts) {
  for (const locale of locales) await ports.invalidateCache({ locale, slugs: [] });
}

function batchResult<A extends string>(action: A, slugs: readonly string[]) {
  return { count: slugs.length, items: slugs.map((slug, index) => ({ index, action, slug })) };
}

export const entityCapabilities = [
  implement(adminGetEntity, async (ports, { slug }) => {
    const { repository } = await entities(ports);
    const entity = (await repository.listEntityRecords()).find((record) => record.slug === slug);
    if (!entity) throw new CapabilityFailure("Entity not found.");
    return { entity };
  }),

  implement(adminCreateEntity, async (ports, input) => {
    const { commands } = await entities(ports);
    const entity = await commands.createOne(input);
    await refresh(ports);
    return { entity };
  }),

  implement(adminUpdateEntity, async (ports, input) => {
    const { commands } = await entities(ports);
    const entity = await commands.updateOne(input);
    await refresh(ports);
    return { entity };
  }),

  implement(adminDeleteEntity, async (ports, { slug }) => {
    const { commands } = await entities(ports);
    await commands.deleteOne(slug);
    await refresh(ports);
    return { deletedSlug: slug };
  }),

  implement(adminCreateEntities, async (ports, { items }) => {
    const { commands } = await entities(ports);
    const created = await commands.createMany(items);
    await refresh(ports);
    return batchResult("created", created.map((entity) => entity.slug));
  }),

  implement(adminUpdateEntities, async (ports, { items }) => {
    const { commands } = await entities(ports);
    const updated = await commands.updateMany(items);
    await refresh(ports);
    return batchResult("updated", updated.map((entity) => entity.slug));
  }),

  implement(adminDeleteEntities, async (ports, { slugs }) => {
    const { commands } = await entities(ports);
    await commands.deleteMany(slugs);
    await refresh(ports);
    return batchResult("deleted", slugs);
  }),
];
