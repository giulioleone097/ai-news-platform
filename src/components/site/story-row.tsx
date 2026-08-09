import Image from "next/image";
import Link from "next/link";
import type { ArticleListItem } from "@/modules/editorial/application/public-feed";
import { getPublicSiteUrl } from "@/config/env";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { BookmarkButton } from "./bookmark-button";
import { ShareActions } from "./share-actions";

export function StoryRow({
  article,
  locale,
  index = 0,
}: {
  article: ArticleListItem;
  locale: Locale;
  index?: number;
}) {
  const messages = getMessages(locale);
  const articlePath = localizedPath(`/articles/${article.slug}`, locale);
  const url = new URL(articlePath, getPublicSiteUrl()).toString();

  return (
    <article className={`story-row story-row--${(index % 3) + 1}`}>
      <Link className="story-row__image" href={articlePath} tabIndex={-1} aria-hidden="true" prefetch={false}>
        <Image
          src={article.coverImage}
          alt=""
          width={480}
          height={320}
          sizes="(max-width: 640px) 42vw, 160px"
        />
      </Link>
      <div className="story-row__copy">
        <Link className="category-label" href={localizedPath(`/categories/${article.category.slug}`, locale)} prefetch={false}>
          {article.category.name}
        </Link>
        <h3><Link href={articlePath} prefetch={false}>{article.title}</Link></h3>
        <p>{article.excerpt}</p>
      </div>
      <div className="story-row__actions">
        <BookmarkButton articleId={article.id} copy={messages.bookmark} compact />
        <ShareActions url={url} title={article.title} labels={messages.share} compact />
      </div>
    </article>
  );
}
