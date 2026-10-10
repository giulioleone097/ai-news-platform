import "server-only";

import type { Locale } from "@/i18n";
import type { EntityKind, EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import { runEditorCapability } from "@/server/capabilities";

export type EntityListItem = Pick<
  EntitySummary,
  "kind" | "slug" | "name" | "officialUrl" | "parent" | "storyCount"
>;

/** The entities through the same `list_entities` capability the MCP and the site tools use. */
export async function listEntityItems(locale: Locale, kind?: EntityKind) {
  const result = await runEditorCapability("list_entities", { locale, kind });
  if (!result.ok) return result;
  return { ok: true as const, items: (result.result as { items: EntityListItem[] }).items };
}
