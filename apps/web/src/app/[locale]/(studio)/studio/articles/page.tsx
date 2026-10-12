import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { ArticleList } from "@/components/studio/article-list";
import { Note } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { Pagination } from "@/components/studio/pagination";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { articleStatuses, formatArticleStatus, type ArticleStatus } from "@atlasnews/core/editorial/domain/article";
import { getStudioEditorialRepositories } from "@/server/composition";

export const metadata: Metadata = { robots: { index: false } };

const pageSize = 25;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudioArticlesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const [all, categories] = await Promise.all([
    repositories.articles.listForStudio(locale),
    repositories.articles.listCategories(locale),
  ]);
  const messages = getMessages(locale);
  const { studio } = messages;
  const copy = studioSupplementalCopy[locale];

  const query = first(search.q)?.trim().slice(0, 120) ?? "";
  const requestedStatus = first(search.status);
  const status = articleStatuses.includes(requestedStatus as ArticleStatus) ? (requestedStatus as ArticleStatus) : undefined;
  const category = categories.find((candidate) => candidate.slug === first(search.category))?.slug;
  const order = first(search.order) === "asc" ? "asc" : "desc";
  const parsedPage = Number.parseInt(first(search.page) ?? "1", 10);

  const needle = query.toLocaleLowerCase(locale);
  const matching = all
    .filter(
      (article) =>
        (!status || article.status === status) &&
        (!category || article.category.slug === category) &&
        (!needle || article.title.toLocaleLowerCase(locale).includes(needle)),
    )
    .sort((a, b) => (order === "asc" ? 1 : -1) * a.updatedAt.localeCompare(b.updatedAt));
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Number.isSafeInteger(parsedPage) ? Math.min(Math.max(parsedPage, 1), pages) : 1;
  const visible = matching.slice((page - 1) * pageSize, page * pageSize);
  const filtered = Boolean(query || status || category);

  const href = (next: { status?: ArticleStatus; order?: "asc" | "desc"; page?: number }) => {
    const params = new URLSearchParams();
    const nextStatus = "status" in next ? next.status : status;
    const nextOrder = next.order ?? order;
    if (query) params.set("q", query);
    if (nextStatus) params.set("status", nextStatus);
    if (category) params.set("category", category);
    if (nextOrder === "asc") params.set("order", "asc");
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const string = params.toString();
    return `/${locale}/studio/articles${string ? `?${string}` : ""}`;
  };

  return (
    <>
      <PageHead description={copy.articlesDescription} scope={studio.scope.articles} title={studio.articles}>
        <Link className="button button--primary" href={`/${locale}/studio/articles/new`}>
          <Plus aria-hidden="true" />
          {studio.newArticle}
        </Link>
      </PageHead>

      {search.deleted ? <Note tone="success">{studio.articleDeleted}</Note> : null}

      <section aria-label={studio.articleList} className="studio-stack">
        <form className="studio-toolbar" method="get">
          <label className="studio-search">
            <span className="sr-only">{studio.searchTitles}</span>
            <Search aria-hidden="true" />
            <input className="studio-control" defaultValue={query} name="q" placeholder={studio.searchTitles} type="search" />
          </label>
          <nav aria-label={studio.filterByStatus} className="studio-segmented">
            <Link aria-current={status ? undefined : "page"} href={href({ status: undefined })}>{studio.all}</Link>
            {articleStatuses.map((value) => (
              <Link aria-current={status === value ? "page" : undefined} href={href({ status: value })} key={value}>
                {formatArticleStatus(value, locale)}
              </Link>
            ))}
          </nav>
          <select aria-label={studio.categoryLabel} className="studio-control" defaultValue={category ?? ""} name="category">
            <option value="">{studio.allCategories}</option>
            {categories.map((candidate) => (
              <option key={candidate.slug} value={candidate.slug}>{candidate.name}</option>
            ))}
          </select>
          {status ? <input name="status" type="hidden" value={status} /> : null}
          {order === "asc" ? <input name="order" type="hidden" value="asc" /> : null}
          <button className="button button--quiet" type="submit">{studio.apply}</button>
        </form>

        {matching.length ? (
          <ArticleList
            articles={visible}
            bulk
            locale={locale}
            messages={messages}
            now={new Date().getTime()}
            sort={{ order, href: href({ order: order === "asc" ? "desc" : "asc" }) }}
          />
        ) : filtered ? (
          <div className="empty-state">
            <h2>{studio.noMatches}</h2>
            <Link className="button button--quiet" href={`/${locale}/studio/articles`}>{studio.clearFilters}</Link>
          </div>
        ) : (
          <ArticleList articles={[]} locale={locale} messages={messages} now={0} />
        )}

        <Pagination
          copy={studio.pagination}
          from={(page - 1) * pageSize + 1}
          nextHref={page < pages ? href({ page: page + 1 }) : undefined}
          previousHref={page > 1 ? href({ page: page - 1 }) : undefined}
          to={(page - 1) * pageSize + visible.length}
          total={matching.length}
        />
      </section>
    </>
  );
}
