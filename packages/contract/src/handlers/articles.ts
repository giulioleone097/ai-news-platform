import type { Article } from "@atlasnews/core/editorial/domain/article";
import { ArticleCommandService } from "@atlasnews/core/editorial/application/article-commands";

import { CapabilityFailure, implement } from "../capability";
import { newsroomArticle } from "../presenters";
import type { CapabilityPorts } from "../ports";
import {
  adminCreateArticle,
  adminCreateArticles,
  adminDeleteArticle,
  adminDeleteArticles,
  adminGetArticle,
  adminListArticles,
  adminPublishArticle,
  adminPublishArticles,
  adminUnpublishArticle,
  adminUnpublishArticles,
  adminUpdateArticle,
  adminUpdateArticles,
} from "../specs/articles";

async function articleCommands(ports: CapabilityPorts) {
  const repository = await ports.editorial();
  return { repository, commands: new ArticleCommandService(repository, repository) };
}

async function findOrFail(repository: Awaited<ReturnType<typeof articleCommands>>["repository"], id: string, locale: "en" | "it") {
  const article = await repository.findById(id, locale);
  if (!article) throw new CapabilityFailure("Article not found.");
  return article;
}

/** Refreshes what the public sees of these articles, once per locale. */
async function refresh(ports: CapabilityPorts, changed: ReadonlyArray<{ locale: Article["locale"]; slugs: readonly string[] }>) {
  const byLocale = new Map<Article["locale"], Set<string>>();
  for (const { locale, slugs } of changed) {
    byLocale.set(locale, new Set([...(byLocale.get(locale) ?? []), ...slugs]));
  }
  for (const [locale, slugs] of byLocale) await ports.invalidateCache({ locale, slugs: [...slugs] });
}

/** What a batch says about each article, in request order. */
function batchResult<A extends string>(action: A, articles: readonly Article[], status: (article: Article) => Article["status"] | null) {
  return {
    count: articles.length,
    items: articles.map((article, index) => ({
      index,
      action,
      id: article.id,
      locale: article.locale,
      slug: article.slug,
      title: article.title,
      status: status(article),
    })),
  };
}

const statusOf = (article: Article) => article.status;

export const articleCapabilities = [
  implement(adminListArticles, async (ports, { locale, ...filter }) => ({
    items: (await (await ports.editorial()).listForStudio(locale, filter)).map(newsroomArticle),
  })),

  implement(adminGetArticle, async (ports, { id, locale }) => {
    const { repository } = await articleCommands(ports);
    return { article: newsroomArticle(await findOrFail(repository, id, locale)) };
  }),

  implement(adminCreateArticle, async (ports, input) => {
    const { commands } = await articleCommands(ports);
    const article = await commands.create(input);
    await refresh(ports, [{ locale: article.locale, slugs: [article.slug] }]);
    return { article: newsroomArticle(article) };
  }),

  implement(adminUpdateArticle, async (ports, { id, locale, ...changes }) => {
    const { repository, commands } = await articleCommands(ports);
    const current = await findOrFail(repository, id, locale);
    const article = await commands.patch(current, changes);
    await refresh(ports, [{ locale, slugs: [current.slug, article.slug] }]);
    return { article: newsroomArticle(article) };
  }),

  implement(adminPublishArticle, async (ports, { id, locale }) => {
    const { repository, commands } = await articleCommands(ports);
    const article = await commands.publish(await findOrFail(repository, id, locale));
    await refresh(ports, [{ locale, slugs: [article.slug] }]);
    return { article: newsroomArticle(article) };
  }),

  implement(adminUnpublishArticle, async (ports, { id, locale }) => {
    const { repository, commands } = await articleCommands(ports);
    const article = await commands.unpublish(await findOrFail(repository, id, locale));
    await refresh(ports, [{ locale, slugs: [article.slug] }]);
    return { article: newsroomArticle(article) };
  }),

  implement(adminDeleteArticle, async (ports, { id, locale }) => {
    const { repository, commands } = await articleCommands(ports);
    const current = await findOrFail(repository, id, locale);
    await commands.delete(id);
    await refresh(ports, [{ locale: current.locale, slugs: [current.slug] }]);
    return { deletedId: id };
  }),

  implement(adminCreateArticles, async (ports, { items }) => {
    const { commands } = await articleCommands(ports);
    const articles = await commands.createMany(items);
    await refresh(ports, articles.map((article) => ({ locale: article.locale, slugs: [article.slug] })));
    return batchResult("created", articles, statusOf);
  }),

  implement(adminUpdateArticles, async (ports, { items }) => {
    const { commands } = await articleCommands(ports);
    const saved = await commands.patchMany(items.map(({ id, locale, ...changes }) => ({ id, locale, changes })));
    await refresh(ports, saved.map(({ article, previousSlug }) => ({ locale: article.locale, slugs: [previousSlug, article.slug] })));
    return batchResult("updated", saved.map(({ article }) => article), statusOf);
  }),

  implement(adminPublishArticles, async (ports, { items }) => {
    const { commands } = await articleCommands(ports);
    const articles = await commands.publishMany(items);
    await refresh(ports, articles.map((article) => ({ locale: article.locale, slugs: [article.slug] })));
    return batchResult("published", articles, statusOf);
  }),

  implement(adminUnpublishArticles, async (ports, { items }) => {
    const { commands } = await articleCommands(ports);
    const articles = await commands.unpublishMany(items);
    await refresh(ports, articles.map((article) => ({ locale: article.locale, slugs: [article.slug] })));
    return batchResult("unpublished", articles, statusOf);
  }),

  implement(adminDeleteArticles, async (ports, { items }) => {
    const { commands } = await articleCommands(ports);
    const articles = await commands.deleteMany(items);
    await refresh(ports, articles.map((article) => ({ locale: article.locale, slugs: [article.slug] })));
    return batchResult("deleted", articles, () => null);
  }),
];
