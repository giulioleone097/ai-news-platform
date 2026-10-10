import type { Article, ArticleDraftInput, Category } from "@atlasnews/core/editorial/domain/article";

export function articlePath(article: Pick<Article, "locale" | "slug">) {
  return `/${article.locale}/articles/${article.slug}`;
}

export function toArticleSummary(article: Article) {
  return {
    locale: article.locale,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: { slug: article.category.slug, name: article.category.name },
    publishedAt: article.publishedAt ?? article.updatedAt,
    readingMinutes: article.readingMinutes,
    path: articlePath(article),
  };
}

export function toArticle(article: Article) {
  return {
    ...toArticleSummary(article),
    content: article.content,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    author: { name: article.author.name, role: article.author.role },
    updatedAt: article.updatedAt,
  };
}

export function toCategory(category: Category) {
  return { slug: category.slug, name: category.name, description: category.description };
}

/** The article as Markdown with its public URL, for `fetch` and for article resources. */
export function articleAsMarkdown(article: Article, url: string) {
  return [
    `# ${article.title}`,
    "",
    `${article.category.name} · ${article.publishedAt ?? article.updatedAt} · ${article.readingMinutes} min · ${article.author.name}`,
    `Source: ${url}`,
    "",
    `> ${article.excerpt}`,
    "",
    article.content,
  ].join("\n");
}

export function newsroomArticle(article: Article) {
  return {
    id: article.id,
    translationKey: article.translationKey,
    locale: article.locale,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    category: { slug: article.category.slug, name: article.category.name },
    status: article.status,
    featured: article.featured,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    publishedAt: article.publishedAt,
    scheduledFor: article.scheduledFor,
    updatedAt: article.updatedAt,
    distribution: article.distribution,
  };
}

export function toDraft(article: Article): ArticleDraftInput {
  return {
    id: article.id,
    translationKey: article.translationKey,
    locale: article.locale,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    categorySlug: article.category.slug,
    status: article.status,
    featured: article.featured,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    scheduledFor: article.scheduledFor,
    distribution: article.distribution,
  };
}
