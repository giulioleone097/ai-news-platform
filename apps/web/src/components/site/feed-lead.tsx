import Image from "next/image";
import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { FeedMeta, type StatusLabels } from "./feed-row";
import { toFeedItem } from "./feed-item";

/** The one static lead of the home feed: a larger row with the excerpt and a small cover. */
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
    <article className="feed-row feed-row--lead">
      <FeedMeta item={toFeedItem(article)} locale={locale} statusLabels={statusLabels} />
      <h2 className="feed-row__title">
        <Link href={localizedPath(`/articles/${article.slug}`, locale)} prefetch>
          {article.title}
        </Link>
      </h2>
      <p className="feed-row__excerpt">{article.excerpt}</p>
      <span className="feed-row__cover">
        <Image
          src={article.coverImage}
          alt=""
          width={360}
          height={240}
          sizes="(max-width: 47.99rem) 84px, 144px"
          quality={70}
          fetchPriority="high"
          loading="eager"
        />
      </span>
    </article>
  );
}
