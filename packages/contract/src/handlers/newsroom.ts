import {
  hasExpectedImageSignature,
} from "@atlasnews/core/editorial/domain/editorial-image";
import { ArticleCommandService } from "@atlasnews/core/editorial/application/article-commands";

import { CapabilityFailure, implement } from "../capability";
import { newsroomArticle, toDraft } from "../presenters";
import {
  adminCreateArticle,
  adminDeleteArticle,
  adminDeleteMedia,
  adminGetArticle,
  adminListArticles,
  adminListCategories,
  adminListDistribution,
  adminListMedia,
  adminListNewsletterSubscriptions,
  adminPublishArticle,
  adminUpdateArticle,
  adminUpdateDistribution,
  adminUpdateNewsletterSubscription,
  adminUploadMedia,
} from "../specs/newsroom";

const scheduledNeedsDate = "scheduledFor is required for scheduled articles.";

export const newsroomCapabilities = [
  implement(adminListArticles, async (ports, { locale }) => ({
    items: (await (await ports.editorial()).listForStudio(locale)).map(newsroomArticle),
  })),

  implement(adminGetArticle, async (ports, { id, locale }) => {
    const article = await (await ports.editorial()).findById(id, locale);
    if (!article) throw new CapabilityFailure("Article not found.");
    return { article: newsroomArticle(article) };
  }),

  implement(adminListCategories, async (ports, { locale }) => ({
    categories: (await (await ports.editorial()).listCategories(locale)).map((category) => ({ ...category })),
  })),

  implement(adminCreateArticle, async (ports, input) => {
    if (input.status === "scheduled" && !input.scheduledFor) throw new CapabilityFailure(scheduledNeedsDate);
    const article = await new ArticleCommandService(await ports.editorial()).save(input);
    await ports.invalidateCache({ locale: article.locale, slugs: [article.slug] });
    return { article: newsroomArticle(article) };
  }),

  implement(adminUpdateArticle, async (ports, { id, locale, ...changes }) => {
    const repository = await ports.editorial();
    const current = await repository.findById(id, locale);
    if (!current) throw new CapabilityFailure("Article not found.");
    const draft = { ...toDraft(current), ...changes, id, locale };
    if (draft.status === "scheduled" && !draft.scheduledFor) throw new CapabilityFailure(scheduledNeedsDate);
    const article = await new ArticleCommandService(repository).save(draft);
    await ports.invalidateCache({ locale: article.locale, slugs: [current.slug, article.slug] });
    return { article: newsroomArticle(article) };
  }),

  implement(adminPublishArticle, async (ports, { id, locale }) => {
    const repository = await ports.editorial();
    const current = await repository.findById(id, locale);
    if (!current) throw new CapabilityFailure("Article not found.");
    const article = await new ArticleCommandService(repository).publish(current);
    await ports.invalidateCache({ locale: article.locale, slugs: [article.slug] });
    return { article: newsroomArticle(article) };
  }),

  implement(adminDeleteArticle, async (ports, { id, locale }) => {
    const repository = await ports.editorial();
    const current = await repository.findById(id, locale);
    if (!current) throw new CapabilityFailure("Article not found.");
    await new ArticleCommandService(repository).delete(id);
    await ports.invalidateCache({ locale: current.locale, slugs: [current.slug] });
    return { deletedId: id };
  }),

  implement(adminListDistribution, async (ports, { locale }) => ({
    items: (await (await ports.editorial()).listPublications(locale)).map((item) => ({ ...item })),
  })),

  implement(adminUpdateDistribution, async (ports, input) => ({
    publication: { ...await (await ports.editorial()).updatePublication({
      ...input,
      externalUrl: input.externalUrl || null,
    }) },
  })),

  implement(adminListNewsletterSubscriptions, async (ports, input) => {
    const page = await (await ports.editorial()).listSubscriptions(input);
    return { ...page, items: page.items.map((item) => ({ ...item })) };
  }),

  implement(adminUpdateNewsletterSubscription, async (ports, { id, status }) => {
    await (await ports.editorial()).updateSubscriptionStatus(id, status);
    return { id, status };
  }),

  implement(adminListMedia, async (ports) => {
    const repository = await ports.editorial();
    return { writable: repository.writable, items: (await repository.listAssets()).map((asset) => ({ ...asset })) };
  }),

  implement(adminUploadMedia, async (ports, { name, mimeType, dataBase64 }) => {
    const repository = await ports.editorial();
    if (!repository.writable) throw new CapabilityFailure("Media uploads require Supabase Storage.");
    const bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
    if (!bytes.byteLength || bytes.byteLength > 163_840) throw new CapabilityFailure("Media payload exceeds 160 KiB.");
    if (!hasExpectedImageSignature(bytes, mimeType)) {
      throw new CapabilityFailure("Media bytes do not match the declared image type.");
    }
    return { asset: { ...await repository.uploadAsset({ name, mimeType, bytes }) } };
  }),

  implement(adminDeleteMedia, async (ports, { path }) => {
    const repository = await ports.editorial();
    if (!repository.writable) throw new CapabilityFailure("Media deletion requires Supabase Storage.");
    const asset = (await repository.listAssets()).find((item) => item.path === path);
    if (!asset) throw new CapabilityFailure("Media asset not found.");
    if (await repository.isAssetReferenced(asset.path)) {
      throw new CapabilityFailure("Media asset is referenced by an article.");
    }
    await repository.deleteAsset(path);
    return { deletedPath: path };
  }),
];
