import type {
  Article,
  ArticleDraftInput,
  ArticlePage,
  ArticleQuery,
  Category,
  SocialChannel,
} from "./article";
import type { Locale } from "@/i18n";

export interface ArticleRepository {
  listPublished(query: ArticleQuery): Promise<ArticlePage>;
  listForStudio(locale: Locale): Promise<Article[]>;
  findBySlug(slug: string, locale: Locale): Promise<Article | null>;
  findById(id: string, locale: Locale): Promise<Article | null>;
  listCategories(locale: Locale): Promise<Category[]>;
  save(input: ArticleDraftInput): Promise<Article>;
  delete(id: string): Promise<void>;
  setDistributionChannels(id: string, channels: SocialChannel[]): Promise<void>;
}

export interface NewsletterRepository {
  subscribe(
    email: string,
    source: string,
    locale: Locale,
  ): Promise<"created" | "existing">;
}

export interface EditorialRepositories {
  articles: ArticleRepository;
  newsletter: NewsletterRepository;
  mode: "demo" | "supabase";
}
