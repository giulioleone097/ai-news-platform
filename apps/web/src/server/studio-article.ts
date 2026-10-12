import type { CapabilityErrorCode } from "@atlasnews/contract";
import {
  draftStatuses,
  slugify,
  type ArticleDraftInput,
  type ArticleStatus,
  type DraftStatus,
} from "@atlasnews/core/editorial/domain/article";
import type { Locale } from "@/i18n";
import type { CapabilityRunResult } from "@/server/capabilities";
import { runStudioCapability } from "@/server/studio-capability";

/** The article form as the Studio action reads it. */
export type StudioArticleForm = Omit<ArticleDraftInput, "translationKey" | "status" | "scheduledFor"> & {
  locale: Locale;
  status: ArticleStatus;
  /** A UTC instant; only used when the status is scheduled. */
  scheduledFor: string | null;
  /** The slug of the same story in the other language; "" unlinks the two, and omitted leaves the link alone. */
  translationOf?: string;
};

export type StudioArticleOutcome =
  | { ok: true; article: { id: string; slug: string } }
  | {
      ok: false;
      /** In the editor's language. */
      error: string;
      code?: CapabilityErrorCode;
      /** Set when the article was already created, so a retry updates it instead of creating a second one. */
      articleId?: string;
    };

interface SavedArticle {
  id: string;
  slug: string;
  status: ArticleStatus;
  scheduledFor: string | null;
}

const isDraftStatus = (status: ArticleStatus): status is DraftStatus => (draftStatuses as readonly string[]).includes(status);

/** The form field a rule's code is about, so the screen can show the message under it. */
export const articleFieldOfCode: Partial<Record<CapabilityErrorCode, string>> = {
  "article.invalidTitle": "title",
  "article.invalidExcerpt": "excerpt",
  "article.invalidContent": "content",
  "article.invalidSlug": "slug",
  "article.slugTaken": "slug",
  "article.invalidCategory": "categorySlug",
  "article.unknownCategory": "categorySlug",
  "article.invalidStatus": "status",
  "article.scheduleRequired": "scheduledFor",
  "article.invalidCoverImage": "coverImage",
  "article.invalidCoverAlt": "coverAlt",
  "article.invalidChannel": "distribution",
  "article.invalidClaimStatus": "claimStatus",
  "article.invalidKeyPoints": "keyPoints",
  "article.invalidSources": "sources",
  "article.invalidEntities": "entities",
  "article.unknownEntity": "entities",
  "article.translationNotFound": "translationOf",
  "article.translationSameLocale": "translationOf",
  "article.translationTaken": "translationOf",
};

/**
 * Saves what the article form posted through the catalogue, as an agent would: create or update, then
 * publish or unpublish when the status asks for it. The Studio's own submit is the person's confirmation
 * of the status they chose, so publishing and unpublishing run `confirmed`. Create and update only move
 * between the draft statuses, and publishing is its own capability, so a form that goes live or back is
 * more than one call; each call checks the scope and attributes the change on its own.
 */
export async function saveStudioArticle(form: StudioArticleForm): Promise<StudioArticleOutcome> {
  const { id, locale, status, scheduledFor, translationOf, slug, coverImage, ...fields } = form;
  const run = (name: string, input: unknown, confirmed = false) =>
    runStudioCapability(locale, name, input, confirmed ? { confirmed } : {});
  const failed = (outcome: Extract<CapabilityRunResult, { ok: false }>, articleId?: string): StudioArticleOutcome => ({
    ok: false,
    error: outcome.error,
    ...(outcome.code ? { code: outcome.code } : {}),
    ...(articleId ? { articleId } : {}),
  });
  // A blank cover keeps the stored one (a new article gets the default picture).
  const body = { ...fields, coverImage: coverImage || undefined };

  if (!id) {
    const created = await run("admin_create_article", {
      locale,
      ...body,
      slug: slug || undefined,
      // Going live is its own step, after the article exists.
      status: isDraftStatus(status) ? status : "draft",
      scheduledFor: status === "scheduled" ? scheduledFor : null,
      ...(translationOf ? { translationOf } : {}),
    });
    if (!created.ok) return failed(created);
    const article = created.result.article as SavedArticle;
    if (status !== "published") return { ok: true, article };
    const published = await run("admin_publish_article", { id: article.id, locale }, true);
    return published.ok ? { ok: true, article } : failed(published, article.id);
  }

  const found = await run("admin_get_article", { id, locale });
  if (!found.ok) return failed(found);
  const current = found.result.article as SavedArticle;
  const live = current.status === "published";

  // An update moves between the draft statuses only: what is already live stays so until it is unpublished,
  // and what is about to go live keeps its status (and date) until it is published.
  const updateStatus = live || !isDraftStatus(status) ? undefined : status;
  const keptStatus = updateStatus ?? current.status;
  const updated = await run("admin_update_article", {
    id,
    locale,
    ...body,
    // A blank slug asks for one made from the title, as the form says.
    slug: slug || slugify(fields.title),
    ...(updateStatus ? { status: updateStatus } : {}),
    scheduledFor: keptStatus !== "scheduled" ? null : updateStatus ? scheduledFor : current.scheduledFor,
    ...(translationOf === undefined ? {} : { translationOf: translationOf || null }),
  });
  if (!updated.ok) return failed(updated);
  const article = updated.result.article as SavedArticle;

  if (status === "published" && !live) {
    const published = await run("admin_publish_article", { id, locale }, true);
    return published.ok ? { ok: true, article } : failed(published, id);
  }
  if (live && status !== "published") {
    const unpublished = await run("admin_unpublish_article", { id, locale }, true);
    if (!unpublished.ok) return failed(unpublished, id);
    // Unpublishing returns the article to draft; review and scheduled are one more step.
    if (isDraftStatus(status) && status !== "draft") {
      const moved = await run("admin_update_article", { id, locale, status, scheduledFor: status === "scheduled" ? scheduledFor : null });
      if (!moved.ok) return failed(moved, id);
    }
  }
  return { ok: true, article };
}
