import { z } from "zod";
import type { EntityDetail, EntityRecord } from "@atlasnews/core/editorial/domain/entity";
import { entityKinds } from "@atlasnews/core/editorial/domain/entity";
import { locales, type Locale } from "@atlasnews/core/locale";
import { relationOne } from "./shared";

const entityRowSchema = z.object({
  id: z.string(),
  kind: z.enum(entityKinds),
  slug: z.string(),
  name: z.string(),
  official_url: z.string().nullable(),
  parent: z.union([
    z.object({ slug: z.string(), name: z.string() }),
    z.array(z.object({ slug: z.string(), name: z.string() })),
  ]).nullable(),
  descriptions: z.array(z.object({ locale: z.enum(locales), description: z.string() })),
});

export const entitySelect = `
  id, kind, slug, name, official_url,
  parent:parent_id(slug, name),
  descriptions:entity_descriptions(locale, description)
`;

export function mapEntity(value: unknown, locale: Locale): EntityDetail {
  const row = entityRowSchema.parse(value);
  const parent = row.parent ? relationOne(row.parent) : null;
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    officialUrl: row.official_url,
    parent: parent ? { slug: parent.slug, name: parent.name } : null,
    description: row.descriptions.find((item) => item.locale === locale)?.description ?? "",
  };
}

export function mapEntityRecord(value: unknown): EntityRecord {
  const row = entityRowSchema.parse(value);
  const parent = row.parent ? relationOne(row.parent) : null;
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    officialUrl: row.official_url,
    parent: parent ? { slug: parent.slug, name: parent.name } : null,
    descriptions: Object.fromEntries(row.descriptions.map((item) => [item.locale, item.description])),
  };
}
