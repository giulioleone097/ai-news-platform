import type { D1Database } from "../sites/cloudflare";

// Test support only: the minimal editorial rows that comments hang off (the schema of 0000_content).

let authorId: string | null = null;
const categoryIds: Record<string, string> = {};

async function ensureCategory(database: D1Database, locale: string) {
  authorId ??= crypto.randomUUID();
  await database
    .prepare("INSERT OR IGNORE INTO authors (id, name, initials) VALUES (?, 'Test Author', 'TA')")
    .bind(authorId)
    .run();
  categoryIds[locale] ??= crypto.randomUUID();
  await database
    .prepare(
      `INSERT OR IGNORE INTO categories (id, translation_key, locale, slug, name, created_at)
       VALUES (?, 'comments-test', ?, 'comments-test', 'Comments test', ?)`,
    )
    .bind(categoryIds[locale], locale, new Date().toISOString())
    .run();
  return categoryIds[locale]!;
}

/** Inserts one article (published an hour ago by default) and returns its id. */
export async function seedPublishedArticle(
  database: D1Database,
  options: { locale?: string; status?: "published" | "draft" } = {},
) {
  const locale = options.locale ?? "en";
  const status = options.status ?? "published";
  const id = crypto.randomUUID();
  const now = new Date();
  const category = await ensureCategory(database, locale);
  await database
    .prepare(
      `INSERT INTO articles (id, translation_key, locale, slug, title, excerpt, content, cover_alt, status,
         category_id, author_id, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'An article about agents', 'An excerpt that is long enough to pass.',
         'Content that is long enough to pass the check.', 'Cover', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      `article-${id}`,
      locale,
      `article-${id}`,
      status,
      category,
      authorId,
      status === "published" ? new Date(now.getTime() - 3_600_000).toISOString() : null,
      now.toISOString(),
      now.toISOString(),
    )
    .run();
  return id;
}
