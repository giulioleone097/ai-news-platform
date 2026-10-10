import type {
  Article,
  ArticleDraftInput,
  Category,
  EntityRef,
} from "@atlasnews/core/editorial/domain/article";
import type { EntityDetail } from "@atlasnews/core/editorial/domain/entity";
import {
  renderStoryMarkdown,
  type StoryMarkdownLabels,
} from "@atlasnews/core/editorial/application/story-markdown";
import type { Locale } from "@atlasnews/core/locale";

export function articlePath(article: Pick<Article, "locale" | "slug">) {
  return `/${article.locale}/articles/${article.slug}`;
}

function toEntityRef({ kind, slug, name, isPrimary }: EntityRef) {
  return { kind, slug, name, isPrimary };
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
    claimStatus: article.claimStatus,
    entities: article.entities.map(toEntityRef),
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
    keyPoints: [...article.keyPoints],
    sources: article.sources.map((source) => ({ ...source })),
  };
}

export function toCategory(category: Category) {
  return { slug: category.slug, name: category.name, description: category.description };
}

export function toEntity(entity: EntityDetail) {
  return {
    kind: entity.kind,
    slug: entity.slug,
    name: entity.name,
    description: entity.description,
    officialUrl: entity.officialUrl,
    parent: entity.parent ? { ...entity.parent } : null,
  };
}

/**
 * The words of the Markdown export, per locale. They repeat the story section of the web
 * messages, because the contract cannot import the web app; core should own them.
 */
const storyLabels: Record<Locale, StoryMarkdownLabels> = {
  en: {
    claimStatus: { confirmed: "Confirmed", rollout: "Rolling out", test: "In test", rumour: "Rumour", analysis: "Analysis" },
    entityKind: { company: "Company", model: "Model", product: "Product" },
    keyPoints: "Key points",
    sources: "Sources",
  },
  it: {
    claimStatus: { confirmed: "Confermato", rollout: "In rilascio", test: "In test", rumour: "Rumor", analysis: "Analisi" },
    entityKind: { company: "Azienda", model: "Modello", product: "Prodotto" },
    keyPoints: "Punti chiave",
    sources: "Fonti",
  },
};

/** The article as Markdown with its public URL, for `fetch` and for article resources. */
export function articleAsMarkdown(article: Article, url: string) {
  return renderStoryMarkdown(article, url, storyLabels[article.locale]);
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
    claimStatus: article.claimStatus,
    keyPoints: [...article.keyPoints],
    sources: article.sources.map((source) => ({ ...source })),
    entities: article.entities.map(toEntityRef),
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
    claimStatus: article.claimStatus,
    keyPoints: [...article.keyPoints],
    sources: article.sources.map((source) => ({ ...source })),
    entities: article.entities.map(({ slug, isPrimary }) => ({ slug, isPrimary })),
  };
}
