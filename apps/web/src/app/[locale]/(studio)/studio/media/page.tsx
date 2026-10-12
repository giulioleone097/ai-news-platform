import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { MediaUpload } from "@/components/studio/media-upload";
import { Note, OffNote } from "@/components/studio/note";
import { PageHead } from "@/components/studio/page-head";
import { studioSupplementalCopy } from "@/components/studio/studio-copy";
import { getMessages, isLocale } from "@/i18n";
import { requireEditor } from "@/lib/editor-auth";
import { getEditorialMediaReferenceKey } from "@atlasnews/core/editorial/domain/editorial-image";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { getStudioEditorialRepositories } from "@/server/composition";
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

  const writable = repositories.media.writable;
  const { studio } = getMessages(locale);

  return (
    <>
      <PageHead description={copy.mediaDescription} scope={studio.scope.media} title={studio.media}>
        {writable ? (
          <MediaUpload
            action={uploadMediaAction}
            copy={{ dropzone: copy.mediaDropzone, help: copy.mediaUploadHelp, label: copy.mediaUploadAction }}
            locale={locale}
          />
        ) : null}
      </PageHead>

      {writable ? null : <OffNote body={copy.mediaOffBody} next={copy.mediaOffNext} title={copy.mediaOffTitle} />}

      {query.uploaded ? (
        <Note tone="success">{copy.mediaUploaded}</Note>
      ) : query.deleted ? (
        <Note tone="success">{copy.mediaDeleted}</Note>
      ) : error ? (
        <Note tone="error">{error === "in-use" ? copy.mediaInUse : copy.mediaError}</Note>
      ) : null}

      {assets.length ? (
        <ul aria-label={studio.media} className="studio-media-grid">
          {assets.map((asset) => (
            <li key={asset.url}>
              <div
                aria-label={asset.name}
                className="studio-media-thumb"
                role="img"
                style={{ backgroundImage: `url(${JSON.stringify(asset.url)})` }}
              />
              <a href={asset.url} rel="noreferrer" target="_blank" title={asset.name}>{asset.name}</a>
              <p>{asset.mimeType} · {formatBytes(asset.size, locale)}</p>
              <p>
                {asset.articles.length ? (
                  <>
                    {copy.usedBy}{" "}
                    {asset.articles.slice(0, 2).map((article, index) => (
                      <span key={article.id}>
                        {index ? ", " : null}
                        <Link href={`/${locale}/studio/articles/${article.id}`}>{article.title}</Link>
                      </span>
                    ))}
                    {asset.articles.length > 2 ? ` +${asset.articles.length - 2}` : null}
                  </>
                ) : (
                  copy.unusedAsset
                )}
              </p>
              {asset.path && writable && !asset.articles.length ? (
                <form action={deleteMediaAction}>
                  <input name="locale" type="hidden" value={locale} />
                  <input name="path" type="hidden" value={asset.path} />
                  <button className="button button--small button--danger" type="submit">
                    <Trash2 aria-hidden="true" />
                    {copy.deleteAsset}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state"><h2>{copy.noAssets}</h2></div>
      )}
    </>
  );
}
