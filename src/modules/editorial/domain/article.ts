export const articleStatuses = [
  "draft",
  "review",
  "scheduled",
  "published",
] as const;

export const socialChannels = ["newsletter", "linkedin", "x", "whatsapp"] as const;

export type ArticleStatus = (typeof articleStatuses)[number];
export type SocialChannel = (typeof socialChannels)[number];

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface Author {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatarUrl?: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  coverAlt: string;
  status: ArticleStatus;
  category: Category;
  author: Author;
  featured: boolean;
  readingMinutes: number;
  publishedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  distribution: SocialChannel[];
}

export interface ArticleDraftInput {
  id?: string;
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  categorySlug: string;
  status: ArticleStatus;
  featured?: boolean;
  coverImage?: string;
  coverAlt?: string;
  scheduledFor?: string | null;
  distribution?: SocialChannel[];
}

export interface ArticleCursor {
  publishedAt: string;
  id: string;
}

export interface ArticlePage {
  items: Article[];
  nextCursor: ArticleCursor | null;
}

export interface ArticleQuery {
  limit?: number;
  category?: string;
  query?: string;
  cursor?: ArticleCursor;
}

export interface ArticleSection {
  heading: string | null;
  paragraphs: string[];
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function estimateReadingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 210));
}

export function parseArticleSections(content: string): ArticleSection[] {
  const sections: ArticleSection[] = [];
  let current: ArticleSection = { heading: null, paragraphs: [] };

  for (const block of content.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean)) {
    if (block.startsWith("## ")) {
      if (current.heading || current.paragraphs.length) sections.push(current);
      current = { heading: block.slice(3).trim(), paragraphs: [] };
    } else {
      current.paragraphs.push(block);
    }
  }

  if (current.heading || current.paragraphs.length) sections.push(current);
  return sections;
}

export function formatArticleStatus(status: ArticleStatus) {
  const labels: Record<ArticleStatus, string> = {
    draft: "Bozza",
    review: "In revisione",
    scheduled: "Programmato",
    published: "Pubblicato",
  };
  return labels[status];
}
