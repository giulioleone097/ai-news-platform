import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";

export const metadata: Metadata = { robots: { index: false } };

export default async function StudioMediaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const articles = await repositories.articles.listForStudio(locale);
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];
  const assets = Array.from(
    articles.reduce((catalog, article) => {
      const current = catalog.get(article.coverImage) ?? { alt: article.coverAlt, articles: [] as typeof articles };
      current.articles.push(article);
      catalog.set(article.coverImage, current);
      return catalog;
    }, new Map<string, { alt: string; articles: typeof articles }>()),
  );

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{messages.studio.media}</p>
          <h1>{copy.mediaTitle}</h1>
          <p>{copy.mediaDescription}</p>
        </div>
      </header>

      {assets.length ? (
        <section className="studio-media-grid" aria-label={copy.mediaTitle}>
          {assets.map(([url, asset], index) => (
            <article className="studio-media-card" key={url}>
              <div className="studio-media-card__preview">
                <ImageIcon aria-hidden="true" size={30} strokeWidth={1.4} />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="studio-media-card__body">
                <p className="studio-kicker">{copy.assetUrl}</p>
                <a href={url} rel="noreferrer" target="_blank">
                  <span>{url}</span>
                  <ArrowUpRight aria-hidden="true" size={15} />
                </a>
                <p>{asset.alt}</p>
                <div className="studio-media-card__usage">
                  <strong>{copy.usedBy}</strong>
                  {asset.articles.map((article) => (
                    <Link href={`/${locale}/studio/articles/${article.id}`} key={article.id}>
                      {article.title}
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="studio-empty-state">
          <ImageIcon aria-hidden="true" size={28} />
          <h2>{copy.noAssets}</h2>
        </div>
      )}
    </>
  );
}
