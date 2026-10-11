import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { EditorialCover } from "./editorial-cover";
import { StoryMeta, type StatusLabels } from "./feed-row";
import { toFeedItem } from "./feed-item";

/** The one lead of the home page: the largest picture and headline on it. */
export function FeedLead({
  article,
  locale,
  statusLabels,
}: {
  article: Article;
  locale: Locale;
  statusLabels: StatusLabels;
}) {
  return (
    <article className="story-lead">
      <span className="story-lead__cover">
        <EditorialCover
          src={article.coverImage}
          alt=""
          sizes="(max-width: 59.99rem) 100vw, 46rem"
          quality={75}
        />
      </span>
      <div className="story-lead__text">
        <StoryMeta item={toFeedItem(article)} locale={locale} statusLabels={statusLabels} stamp="time" />
        <h2 className="story-lead__title">
          <Link href={localizedPath(`/articles/${article.slug}`, locale)} prefetch>
            {article.title}
          </Link>
        </h2>
        <p className="story-lead__deck">{article.excerpt}</p>
      </div>
    </article>
  );
}
