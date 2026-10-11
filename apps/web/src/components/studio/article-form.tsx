"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Locale, Messages } from "@/i18n";
import { toUtcDateTimeInput } from "@/lib/editorial-datetime";
import type { Article, Category } from "@atlasnews/core/editorial/domain/article";
import type { EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import type { MediaAsset } from "@atlasnews/core/editorial/domain/editorial-operations";
import {
  articleStatuses,
  socialChannels,
} from "@atlasnews/core/editorial/domain/article";
import { saveArticleAction } from "@/app/[locale]/(studio)/studio/actions";
import { StoryFields } from "@/app/[locale]/(studio)/studio/articles/story-fields";
import { idleStudioActionState } from "./action-state";
import { DeleteArticleButton } from "./delete-article-button";
import { MarkdownEditor } from "./markdown-editor";
import { Note } from "./note";
import { PageHead } from "./page-head";
import { studioSupplementalCopy } from "./studio-copy";
import { StudioSubmitButton } from "./studio-submit-button";

const channelLabels = { linkedin: "LinkedIn", x: "X", whatsapp: "WhatsApp" } as const;

export function ArticleForm({
  article,
  categories,
  entities,
  locale,
  media,
  messages,
}: {
  article?: Article;
  categories: Record<Locale, Category[]>;
  entities: EntitySummary[];
  locale: Locale;
  media: MediaAsset[];
  messages: Messages;
}) {
  const [state, formAction] = useActionState(saveArticleAction, idleStudioActionState);
  const [articleLocale, setArticleLocale] = useState<Locale>(article?.locale ?? locale);
  const [categorySlug, setCategorySlug] = useState(
    article?.category.slug ?? categories[articleLocale][0]?.slug ?? "",
  );
  const [status, setStatus] = useState(article?.status ?? "draft");
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "/media/neura-agents-hero.webp");
  const copy = studioSupplementalCopy[locale];

  const fieldHasError = (name: string) => Boolean(state.fieldErrors?.[name]?.length);
  const fieldErrorId = (name: string) => `article-${name}-error`;
  const fieldAccessibility = (name: string) => ({
    "aria-describedby": fieldHasError(name) ? fieldErrorId(name) : undefined,
    "aria-invalid": fieldHasError(name) || undefined,
  });
  const fieldError = (name: string) =>
    fieldHasError(name) ? (
      <span className="studio-field__error" id={fieldErrorId(name)}>
        {state.fieldErrors?.[name]?.[0]}
      </span>
    ) : null;

  return (
    <form className="studio-editor" action={formAction} noValidate>
      {article ? <input name="id" type="hidden" value={article.id} /> : null}

      <PageHead
        back={{ href: `/${locale}/studio/articles`, label: messages.studio.articles }}
        title={article?.title ?? messages.studio.newArticle}
      />

      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}

      <div className="studio-editor__grid">
        <div className="studio-editor__main">
          <section className="studio-section">
            <label className="studio-field studio-field--title">
              <span>{messages.studio.titleLabel}</span>
              <input
                {...fieldAccessibility("title")}
                defaultValue={article?.title}
                maxLength={180}
                minLength={8}
                name="title"
                required
              />
              {fieldError("title")}
            </label>

            <label className="studio-field">
              <span>{messages.studio.slugLabel}</span>
              <input
                {...fieldAccessibility("slug")}
                defaultValue={article?.slug}
                maxLength={96}
                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="generated-from-title"
              />
              {fieldError("slug")}
            </label>

            <label className="studio-field">
              <span>{messages.studio.excerptLabel}</span>
              <textarea
                {...fieldAccessibility("excerpt")}
                defaultValue={article?.excerpt}
                maxLength={360}
                minLength={20}
                name="excerpt"
                required
                rows={3}
              />
              {fieldError("excerpt")}
            </label>

            <MarkdownEditor
              copy={copy.markdown}
              defaultValue={article?.content}
              error={fieldError("content")}
              errorId={fieldErrorId("content")}
              help={copy.contentHelp}
              invalid={fieldHasError("content")}
              label={messages.studio.bodyLabel}
            />
          </section>

          <section className="studio-section" aria-labelledby="story-media-title">
            <h2 className="studio-section__title" id="story-media-title">{messages.studio.media}</h2>
            <label className="studio-field">
              <span>{messages.studio.coverImageLabel}</span>
              <input
                {...fieldAccessibility("coverImage")}
                name="coverImage"
                onChange={(event) => setCoverImage(event.target.value)}
                placeholder="/media/cover.png"
                type="text"
                value={coverImage}
              />
              {fieldError("coverImage")}
            </label>
            {media.length ? (
              <label className="studio-field">
                <span>{copy.mediaTitle}</span>
                <select
                  aria-label={copy.mediaTitle}
                  onChange={(event) => {
                    if (event.target.value) setCoverImage(event.target.value);
                  }}
                  value={media.some((asset) => asset.url === coverImage) ? coverImage : ""}
                >
                  <option value="">{copy.assetUrl}</option>
                  {media.map((asset) => <option key={asset.path} value={asset.url}>{asset.name}</option>)}
                </select>
              </label>
            ) : null}
            <label className="studio-field">
              <span>{copy.coverAltLabel}</span>
              <input
                {...fieldAccessibility("coverAlt")}
                defaultValue={article?.coverAlt}
                maxLength={240}
                minLength={3}
                name="coverAlt"
                required
              />
              {fieldError("coverAlt")}
            </label>
          </section>

          <StoryFields
            article={article}
            entities={entities}
            errors={state.fieldErrors}
            messages={messages}
          />
        </div>

        <aside className="studio-editor__aside">
          <div className="studio-buttons">
            <StudioSubmitButton idleLabel={messages.common.save} pendingLabel={messages.studio.saving} />
            <Link className="button button--quiet" href={`/${locale}/studio/articles`}>
              {messages.common.cancel}
            </Link>
          </div>

          <section className="studio-section">
            <label className="studio-field">
              <span>{copy.localeLabel}</span>
              {article ? (
                <>
                  <input name="locale" type="hidden" value={article.locale} />
                  <select
                    {...fieldAccessibility("locale")}
                    aria-label={copy.localeLabel}
                    disabled
                    value={article.locale}
                  >
                    <option value={article.locale}>{article.locale === "en" ? "English" : "Italiano"}</option>
                  </select>
                </>
              ) : (
                <select
                  {...fieldAccessibility("locale")}
                  name="locale"
                  onChange={(event) => {
                    const nextLocale = event.target.value as Locale;
                    setArticleLocale(nextLocale);
                    setCategorySlug(categories[nextLocale][0]?.slug ?? "");
                  }}
                  value={articleLocale}
                >
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                </select>
              )}
              {fieldError("locale")}
            </label>

            <label className="studio-field">
              <span>{messages.studio.categoryLabel}</span>
              <select
                {...fieldAccessibility("categorySlug")}
                name="categorySlug"
                onChange={(event) => setCategorySlug(event.target.value)}
                required
                value={categorySlug}
              >
                {categories[articleLocale].map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
              {fieldError("categorySlug")}
            </label>

            <label className="studio-field">
              <span>{messages.studio.statusLabel}</span>
              <select
                {...fieldAccessibility("status")}
                name="status"
                onChange={(event) => setStatus(event.target.value as Article["status"])}
                value={status}
              >
                {articleStatuses.map((articleStatus) => (
                  <option key={articleStatus} value={articleStatus}>
                    {articleStatus === "draft"
                      ? messages.studio.statusDraft
                      : articleStatus === "published"
                        ? messages.studio.statusPublished
                        : articleStatus === "scheduled"
                          ? messages.studio.statusScheduled
                          : locale === "it"
                            ? "In revisione"
                            : "In review"}
                  </option>
                ))}
              </select>
              {fieldError("status")}
            </label>

            {status === "scheduled" ? (
              <label className="studio-field">
                <span>{messages.studio.publishAtLabel} (UTC)</span>
                <input
                  {...fieldAccessibility("scheduledFor")}
                  defaultValue={toUtcDateTimeInput(article?.scheduledFor ?? null)}
                  name="scheduledFor"
                  required
                  type="datetime-local"
                />
                {fieldError("scheduledFor")}
              </label>
            ) : (
              <input name="scheduledFor" type="hidden" value="" />
            )}

            <label className="studio-check">
              <input defaultChecked={article?.featured} name="featured" type="checkbox" />
              {copy.featuredLabel}
            </label>
          </section>

          <fieldset className="studio-section">
            <legend>{messages.studio.distribution}</legend>
            <p className="studio-muted">{copy.distributionHelp}</p>
            <div>
              {socialChannels.map((channel) => (
                <label className="studio-check" key={channel}>
                  <input
                    {...fieldAccessibility("distribution")}
                    defaultChecked={article?.distribution.includes(channel)}
                    name="distribution"
                    type="checkbox"
                    value={channel}
                  />
                  {channel === "newsletter" ? messages.studio.newsletter : channelLabels[channel]}
                </label>
              ))}
            </div>
            {fieldError("distribution")}
          </fieldset>

          {article ? (
            <section className="studio-section">
              <p className="studio-muted">{messages.studio.deleteConfirmation}</p>
              <DeleteArticleButton locale={locale} messages={messages} />
            </section>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
