import { locales, type Locale } from "../../locale";
import { slugify, slugPattern } from "../domain/article";
import {
  assertBatchSize,
  asSingle,
  batchLimit,
  EditorialRuleError,
  rejectRepeats,
  validateEach,
} from "../domain/errors";
import {
  entityKinds,
  entityLimits,
  type EntityAdminRepository,
  type EntityCreate,
  type EntityKind,
  type EntityPatch,
  type EntityWrite,
} from "../domain/entity";

const httpsUrl = /^https:\/\/[^\s]+$/;

const notFound = (slug: string) => new EditorialRuleError(`Entity "${slug}" not found.`, "entity.notFound", { slug });

/** The slug, kind and parent of every entity as the batch would leave it, so later items see earlier ones. */
type Shape = Map<string, { kind: EntityKind; parentSlug: string | null }>;

function normalize(write: EntityWrite): EntityWrite {
  const name = write.name.trim();
  if (!entityKinds.includes(write.kind)) throw new EditorialRuleError(`Unknown entity kind "${write.kind}".`, "entity.unknownKind", { kind: write.kind });
  if (name.length < entityLimits.name.min || name.length > entityLimits.name.max) {
    throw new EditorialRuleError(
      `Entity name must be ${entityLimits.name.min}-${entityLimits.name.max} characters.`,
      "entity.invalidName",
      entityLimits.name,
    );
  }
  if (!write.slug || write.slug.length > entityLimits.slug.max || !slugPattern.test(write.slug)) {
    throw new EditorialRuleError(
      `Entity slug must be lowercase letters, numbers and hyphens, at most ${entityLimits.slug.max} characters.`,
      "entity.invalidSlug",
      entityLimits.slug,
    );
  }
  const officialUrl = write.officialUrl?.trim() || null;
  if (officialUrl && (officialUrl.length > entityLimits.officialUrl.max || !httpsUrl.test(officialUrl))) {
    throw new EditorialRuleError("officialUrl must be an https URL.", "entity.invalidUrl");
  }
  const descriptions: EntityWrite["descriptions"] = {};
  for (const locale of locales) {
    const text = write.descriptions[locale]?.trim();
    if (text === undefined) continue;
    if (text.length < entityLimits.description.min || text.length > entityLimits.description.max) {
      throw new EditorialRuleError(
        `Description (${locale}) must be ${entityLimits.description.min}-${entityLimits.description.max} characters; send null to remove it.`,
        "entity.invalidDescription",
        { locale, ...entityLimits.description },
      );
    }
    descriptions[locale] = text;
  }
  return { kind: write.kind, slug: write.slug, name, officialUrl, parentSlug: write.parentSlug, descriptions };
}

/** A company has no parent; a model or product has at most one, and it is a company. */
function assertParent(write: EntityWrite, shape: Shape) {
  if (write.parentSlug === null) return;
  if (write.kind === "company") throw new EditorialRuleError("A company has no parent company.", "entity.companyNoParent");
  const parent = shape.get(write.parentSlug);
  if (!parent) throw new EditorialRuleError(`Unknown parent "${write.parentSlug}".`, "entity.unknownParent", { slug: write.parentSlug });
  if (parent.kind !== "company") {
    throw new EditorialRuleError(`The parent "${write.parentSlug}" must be a company.`, "entity.parentNotCompany", { slug: write.parentSlug });
  }
}

/**
 * Companies, models and products, with one description per locale. Every write is a batch of one
 * or more, checked in full first (so every invalid item is reported by index) and written in one
 * transaction. The slug is the handle of an entity and is never renamed.
 */
export class EntityCommandService {
  constructor(private readonly repository: EntityAdminRepository) {}

  createOne(input: EntityCreate) {
    return asSingle(async () => (await this.createMany([input]))[0]);
  }

  updateOne(input: EntityPatch) {
    return asSingle(async () => (await this.updateMany([input]))[0]);
  }

  deleteOne(slug: string) {
    return asSingle(async () => (await this.deleteMany([slug]))[0]);
  }

  async createMany(inputs: EntityCreate[]) {
    assertBatchSize(inputs.length, batchLimit, "entity");
    const shape = await this.shape();
    const writes = await validateEach(
      inputs,
      (input) => {
        const write = normalize({
          kind: input.kind,
          slug: (input.slug ?? "").trim() || slugify(input.name),
          name: input.name,
          officialUrl: input.officialUrl ?? null,
          parentSlug: input.parentSlug ?? null,
          descriptions: input.descriptions ?? {},
        });
        if (shape.has(write.slug)) throw new EditorialRuleError(`The entity "${write.slug}" already exists.`, "entity.exists", { slug: write.slug });
        assertParent(write, shape);
        shape.set(write.slug, { kind: write.kind, parentSlug: write.parentSlug });
        return write;
      },
      (input) => input.slug ?? slugify(input.name),
    );
    return this.repository.createEntities(writes);
  }

  async updateMany(patches: EntityPatch[]) {
    assertBatchSize(patches.length, batchLimit, "entity");
    rejectRepeats(patches, (patch) => patch.slug, (slug) => `The entity "${slug}" appears twice`);
    const records = new Map((await this.repository.listEntityRecords()).map((record) => [record.slug, record]));
    const shape: Shape = new Map([...records].map(([slug, record]) => [slug, { kind: record.kind, parentSlug: record.parent?.slug ?? null }]));

    const writes = await validateEach(
      patches,
      (patch) => {
        const current = records.get(patch.slug);
        if (!current) throw notFound(patch.slug);
        if (!Object.entries(patch).some(([field, value]) => field !== "slug" && value !== undefined)) {
          throw new EditorialRuleError("Nothing to change: pass at least one field.", "change.nothing");
        }
        const descriptions: Partial<Record<Locale, string>> = { ...current.descriptions };
        for (const [locale, text] of Object.entries(patch.descriptions ?? {}) as Array<[Locale, string | null | undefined]>) {
          if (text === null) delete descriptions[locale];
          else if (text !== undefined) descriptions[locale] = text;
        }
        const write = normalize({
          kind: patch.kind ?? current.kind,
          slug: current.slug,
          name: patch.name ?? current.name,
          officialUrl: patch.officialUrl === undefined ? current.officialUrl : patch.officialUrl,
          parentSlug: patch.parentSlug === undefined ? current.parent?.slug ?? null : patch.parentSlug,
          descriptions,
        });
        assertParent(write, shape);
        if (write.kind !== "company" && [...shape].some(([, other]) => other.parentSlug === write.slug)) {
          throw new EditorialRuleError("A company with models or products stays a company.", "entity.companyHasChildren");
        }
        shape.set(write.slug, { kind: write.kind, parentSlug: write.parentSlug });
        return write;
      },
      (patch) => patch.slug,
    );
    return this.repository.updateEntities(writes);
  }

  /** Returns the slugs deleted. An entity that stories link, or that is the company of others, is refused. */
  async deleteMany(slugs: string[]) {
    assertBatchSize(slugs.length, batchLimit, "entity");
    rejectRepeats(slugs, (slug) => slug, (slug) => `The entity "${slug}" appears twice`);
    const [shape, storyCounts] = await Promise.all([this.shape(), this.repository.countEntityStories(slugs)]);
    await validateEach(
      slugs,
      (slug) => {
        if (!shape.has(slug)) throw notFound(slug);
        const stories = storyCounts.get(slug) ?? 0;
        if (stories > 0) {
          throw new EditorialRuleError(
            `Entity "${slug}" is linked to ${stories} stor${stories === 1 ? "y" : "ies"}. Unlink it from them first.`,
            "entity.linked",
            { slug, count: stories },
          );
        }
        // Deleting a company together with its models and products is fine: they go first.
        const left = [...shape].filter(([other, value]) => value.parentSlug === slug && !slugs.includes(other)).length;
        if (left > 0) {
          throw new EditorialRuleError(
            `Entity "${slug}" is the company of ${left} other entit${left === 1 ? "y" : "ies"}. Delete or move them first.`,
            "entity.hasChildren",
            { slug, count: left },
          );
        }
      },
      (slug) => slug,
    );
    // Models and products first, so a company is never deleted while it still has children.
    const ordered = [...slugs].sort((left, right) => Number(shape.get(left)?.kind === "company") - Number(shape.get(right)?.kind === "company"));
    await this.repository.deleteEntities(ordered);
    return slugs;
  }

  private async shape(): Promise<Shape> {
    return new Map((await this.repository.listEntityRecords()).map((record) => [
      record.slug,
      { kind: record.kind, parentSlug: record.parent?.slug ?? null },
    ]));
  }
}
