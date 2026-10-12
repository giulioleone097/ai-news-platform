import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { toFeedItem } from "./feed-item";
import { StoryMeta, type StatusLabels } from "./feed-row";
import { StoryCover } from "./story-cover";

/** A story with its deck, and its picture when `showImage` is set: the home passes it only for a picture the story owns and the page has not shown yet. */
export function StoryCard({
  article,
  locale,
  statusLabels,
  showImage,
}: {
  article: Article;
  locale: Locale;
  statusLabels: StatusLabels;
  showImage: boolean;
}) {
  return (
    <article className="story-card">
      {showImage ? <StoryCover src={article.coverImage} alt="" sizes="(max-width: 47.99rem) 100vw, 26rem" /> : null}
      <StoryMeta item={toFeedItem(article)} locale={locale} statusLabels={statusLabels} stamp="time" size="card" />
      <h2 className="story-card__title">
        <Link href={localizedPath(`/articles/${article.slug}`, locale)} prefetch={false}>
          {article.title}
        </Link>
      </h2>
      <p className="story-card__deck">{article.excerpt}</p>
    </article>
  );
}
