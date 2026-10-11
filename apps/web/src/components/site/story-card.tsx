import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { toFeedItem } from "./feed-item";
import { StoryMeta, type StatusLabels } from "./feed-row";
import { plateTone, StoryCover } from "./story-cover";

/** A story with its cover and deck. `showImage` is false when the picture already appears higher on the page. */
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
  const item = toFeedItem(article);
  return (
    <article className="story-card">
      <StoryCover
        image={showImage && article.coverImage ? { src: article.coverImage, alt: "" } : null}
        label={item.entity?.name ?? item.category.name}
        tone={plateTone(article.category.translationKey)}
        sizes="(max-width: 47.99rem) 100vw, 26rem"
      />
      <StoryMeta item={item} locale={locale} statusLabels={statusLabels} stamp="time" />
      <h2 className="story-card__title">
        <Link href={localizedPath(`/articles/${article.slug}`, locale)} prefetch={false}>
          {article.title}
        </Link>
      </h2>
      <p className="story-card__deck">{article.excerpt}</p>
    </article>
  );
}
