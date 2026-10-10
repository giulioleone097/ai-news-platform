"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bulkCopy } from "@/components/studio/article-bulk/copy";
import type { BulkAction, BulkActionResult } from "@/components/studio/article-bulk/types";
import { locales, type Locale } from "@/i18n";
import { runEditorCapability } from "@/server/capabilities";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";

const capabilities = {
  publish: "admin_publish_articles",
  unpublish: "admin_unpublish_articles",
  delete: "admin_delete_articles",
} as const satisfies Record<BulkAction, string>;

const bulkInput = z.object({
  locale: z.enum(locales),
  ids: z.array(z.string().trim().min(1).max(128)),
});

/**
 * The person confirmed this exact action in the page before it reached here, so the runner is called
 * with `confirmed: true`. The capability is all-or-nothing: a refusal changes nothing and its message is shown.
 */
async function runBulkAction(action: BulkAction, input: { locale: Locale; ids: string[] }): Promise<BulkActionResult> {
  const parsed = bulkInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: bulkCopy.en.invalidRequest };

  const { locale, ids } = parsed.data;
  const copy = bulkCopy[locale];
  if (ids.length === 0) return { status: "error", message: copy.noSelection };
  if (ids.length > batchLimit) return { status: "error", message: copy.tooMany(batchLimit) };

  const outcome = await runEditorCapability(
    capabilities[action],
    { items: ids.map((id) => ({ id, locale })) },
    { confirmed: true },
  ).catch(() => null);
  if (!outcome) return { status: "error", message: copy.failed };
  if (!outcome.ok) return { status: "error", message: outcome.error };

  revalidatePath(`/${locale}/studio`);
  revalidatePath(`/${locale}/studio/articles`);
  const count = typeof outcome.result.count === "number" ? outcome.result.count : ids.length;
  return { status: "success", message: copy.done[action](count) };
}

export async function publishArticlesAction(locale: Locale, ids: string[]): Promise<BulkActionResult> {
  return runBulkAction("publish", { locale, ids });
}

export async function unpublishArticlesAction(locale: Locale, ids: string[]): Promise<BulkActionResult> {
  return runBulkAction("unpublish", { locale, ids });
}

export async function deleteArticlesAction(locale: Locale, ids: string[]): Promise<BulkActionResult> {
  return runBulkAction("delete", { locale, ids });
}
