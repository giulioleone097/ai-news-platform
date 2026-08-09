import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Image as ImageIcon, Upload } from "lucide-react";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getEditorialMediaReferenceKey } from "@/lib/editorial-image";
import type { Article } from "@/modules/editorial/domain/article";
import { getStudioEditorialRepositories } from "@/modules/editorial/infrastructure/container";
import { deleteMediaAction, uploadMediaAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };

function formatBytes(value: number, locale: string) {
  if (!value) return "—";
  const units = ["B", "KB", "MB"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024 ** unit)} ${units[unit]}`;
}

export default async function StudioMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  await requireEditor(locale);
  const repositories = await getStudioEditorialRepositories();
  const [articles, storedAssets] = await Promise.all([
    repositories.articles.listForStudio(locale),
    repositories.media.listAssets(),
  ]);
  const messages = getMessages(locale);
  const copy = studioSupplementalCopy[locale];
  const catalog = new Map<string, {
    path: string | null;
    url: string;
    name: string;
    mimeType: string;
    size: number;
    articles: Article[];
  }>();
  for (const asset of storedAssets) {
    catalog.set(asset.path, {
      path: asset.path,
      url: asset.url,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      articles: [],
    });
  }
  for (const article of articles) {
    const referenceKey = getEditorialMediaReferenceKey(article.coverImage) ?? article.coverImage;
    const current = catalog.get(referenceKey) ?? {
      path: null,
      url: article.coverImage,
      name: article.coverImage.split("/").at(-1) || article.coverImage,
      mimeType: "image",
      size: 0,
      articles: [],
    };
    current.articles.push(article);
    catalog.set(referenceKey, current);
  }
  const assets = [...catalog.values()];
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <>
      <header className="studio-page-header">
        <div>
          <p className="studio-kicker">{messages.studio.media}</p>
          <h1>{copy.mediaTitle}</h1>
          <p>{copy.mediaDescription}</p>
        </div>
      </header>

      {query.uploaded ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.mediaUploaded}</p>
      ) : query.deleted ? (
        <p className="studio-alert studio-alert--success" role="status">{copy.mediaDeleted}</p>
      ) : error ? (
        <p className="studio-alert studio-alert--error" role="alert">
          {error === "in-use" ? copy.mediaInUse : copy.mediaError}
        </p>
      ) : null}

      <section className="studio-media-upload" aria-labelledby="media-upload-title">
        <span className="studio-capability-card__icon" aria-hidden="true"><Upload size={25} /></span>
        <div>
          <p className="studio-kicker">SUPABASE STORAGE</p>
          <h2 id="media-upload-title">{copy.mediaUploadTitle}</h2>
          <p>{repositories.media.writable ? copy.mediaUploadHelp : copy.mediaReadOnly}</p>
        </div>
        <form action={uploadMediaAction}>
          <input name="locale" type="hidden" value={locale} />
          <label className="studio-file-picker">
            <span>{copy.mediaUploadAction}</span>
            <input
              accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
              disabled={!repositories.media.writable}
              name="asset"
              required
              type="file"
            />
          </label>
          <button className="studio-button studio-button--primary" disabled={!repositories.media.writable} type="submit">
            <Upload aria-hidden="true" size={16} />
            {copy.mediaUploadAction}
          </button>
        </form>
      </section>

      {assets.length ? (
        <section className="studio-media-grid" aria-label={copy.mediaTitle}>
          {assets.map((asset, index) => (
            <article className="studio-media-card" key={asset.url}>
              <div
                aria-label={asset.name}
                className="studio-media-card__preview studio-media-card__preview--image"
                role="img"
                style={{ backgroundImage: `url(${JSON.stringify(asset.url)})` }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="studio-media-card__body">
                <div className="studio-media-card__meta">
                  <p className="studio-kicker">{asset.mimeType}</p>
                  <span>{formatBytes(asset.size, locale)}</span>
                </div>
                <a href={asset.url} rel="noreferrer" target="_blank">
                  <span>{asset.name}</span>
                  <ArrowUpRight aria-hidden="true" size={15} />
                </a>
                <div className="studio-media-card__usage">
                  <strong>{copy.usedBy}</strong>
                  {asset.articles.length ? asset.articles.map((article) => (
                    <Link href={`/${locale}/studio/articles/${article.id}`} key={article.id}>{article.title}</Link>
                  )) : <span>{copy.unusedAsset}</span>}
                </div>
                {asset.path && repositories.media.writable && !asset.articles.length ? (
                  <form action={deleteMediaAction}>
                    <input name="locale" type="hidden" value={locale} />
                    <input name="path" type="hidden" value={asset.path} />
                    <button className="studio-button studio-button--danger" type="submit">{copy.deleteAsset}</button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="studio-empty-state"><ImageIcon aria-hidden="true" size={28} /><h2>{copy.noAssets}</h2></div>
      )}
    </>
  );
}
