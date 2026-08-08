import type {
  Article,
  ArticleDraftInput,
  ArticlePage,
  ArticleQuery,
  Category,
  SocialChannel,
} from "./article";

export interface ArticleRepository {
  listPublished(query?: ArticleQuery): Promise<ArticlePage>;
  listForStudio(): Promise<Article[]>;
  findBySlug(slug: string): Promise<Article | null>;
  findById(id: string): Promise<Article | null>;
  listCategories(): Promise<Category[]>;
  save(input: ArticleDraftInput): Promise<Article>;
  delete(id: string): Promise<void>;
  setDistributionChannels(id: string, channels: SocialChannel[]): Promise<void>;
}

export interface NewsletterRepository {
  subscribe(email: string, source: string): Promise<"created" | "existing">;
}

export interface EditorialRepositories {
  articles: ArticleRepository;
  newsletter: NewsletterRepository;
  mode: "demo" | "supabase";
}
