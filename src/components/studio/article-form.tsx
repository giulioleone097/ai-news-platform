"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import type { Article, Category } from "@/modules/editorial/domain/article";
import {
  articleStatuses,
  socialChannels,
} from "@/modules/editorial/domain/article";
import { saveArticleAction } from "@/app/[locale]/(studio)/studio/actions";
import { idleStudioActionState } from "./action-state";
import { DeleteArticleForm } from "./delete-article-form";
import { studioSupplementalCopy } from "./studio-copy";
import { StudioSubmitButton } from "./studio-submit-button";

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

export function ArticleForm({
  article,
  categories,
  locale,
  messages,
}: {
  article?: Article;
  categories: Record<Locale, Category[]>;
  locale: Locale;
  messages: Messages;
}) {
  const [state, formAction] = useActionState(saveArticleAction, idleStudioActionState);
  const [articleLocale, setArticleLocale] = useState<Locale>(article?.locale ?? locale);
  const [categorySlug, setCategorySlug] = useState(
    article?.category.slug ?? categories[articleLocale][0]?.slug ?? "",
  );
  const [status, setStatus] = useState(article?.status ?? "draft");
  const copy = studioSupplementalCopy[locale];

  const fieldError = (name: string) =>
    state.fieldErrors?.[name]?.length ? (
      <span className="studio-field__error">{state.fieldErrors[name][0]}</span>
    ) : null;

  return (
    <form className="studio-editor" action={formAction} noValidate>
      {article ? <input name="id" type="hidden" value={article.id} /> : null}

      <header className="studio-page-header studio-editor__header">
        <div>
          <Link className="studio-back-link" href={`/${locale}/studio/articles`}>
            <ChevronLeft aria-hidden="true" size={16} />
            {messages.studio.articles}
          </Link>
          <p className="studio-kicker">
            {article ? messages.studio.editArticle : messages.studio.createArticle}
          </p>
          <h1>{article?.title ?? messages.studio.newArticle}</h1>
        </div>
        <div className="studio-editor__actions">
          <Link className="studio-button studio-button--secondary" href={`/${locale}/studio/articles`}>
            {messages.common.cancel}
          </Link>
          <StudioSubmitButton idleLabel={messages.common.save} pendingLabel={messages.studio.saving} />
        </div>
      </header>

      {state.status === "error" && state.message ? (
        <p className="studio-alert studio-alert--error" role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="studio-editor__grid">
        <div className="studio-editor__main">
          <section className="studio-panel" aria-labelledby="story-content-title">
            <div className="studio-panel__heading">
              <span>01</span>
              <h2 id="story-content-title">{messages.studio.titleLabel}</h2>
            </div>

            <label className="studio-field studio-field--title">
              <span>{messages.studio.titleLabel}</span>
              <input
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
                defaultValue={article?.excerpt}
                maxLength={360}
                minLength={20}
                name="excerpt"
                required
                rows={4}
              />
              {fieldError("excerpt")}
            </label>

            <label className="studio-field">
              <span>{messages.studio.bodyLabel}</span>
              <textarea
                defaultValue={article?.content}
                minLength={20}
                name="content"
                required
                rows={22}
              />
              <small>{copy.contentHelp}</small>
              {fieldError("content")}
            </label>
          </section>

          <section className="studio-panel" aria-labelledby="story-media-title">
            <div className="studio-panel__heading">
              <span>02</span>
              <h2 id="story-media-title">{messages.studio.media}</h2>
            </div>
            <label className="studio-field">
              <span>{messages.studio.coverImageLabel}</span>
              <input
                defaultValue={article?.coverImage ?? "/media/neura-agents-hero.webp"}
                name="coverImage"
                placeholder="/media/cover.png"
                type="text"
              />
              {fieldError("coverImage")}
            </label>
            <label className="studio-field">
              <span>{copy.coverAltLabel}</span>
              <input
                defaultValue={article?.coverAlt}
                maxLength={240}
                minLength={3}
                name="coverAlt"
                required
              />
              {fieldError("coverAlt")}
            </label>
          </section>
        </div>

        <aside className="studio-editor__aside">
          <section className="studio-panel" aria-labelledby="publishing-title">
            <div className="studio-panel__heading">
              <span>03</span>
              <h2 id="publishing-title">{messages.studio.statusLabel}</h2>
            </div>

            <label className="studio-field">
              <span>{copy.localeLabel}</span>
              {article ? (
                <>
                  <input name="locale" type="hidden" value={article.locale} />
                  <select aria-label={copy.localeLabel} disabled value={article.locale}>
                    <option value={article.locale}>{article.locale === "en" ? "English" : "Italiano"}</option>
                  </select>
                </>
              ) : (
                <select
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
                <span>{messages.studio.publishAtLabel}</span>
                <input
                  defaultValue={toLocalDateTime(article?.scheduledFor ?? null)}
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
              <span aria-hidden="true">
                <Check size={14} />
              </span>
              {copy.featuredLabel}
            </label>
          </section>

          <fieldset className="studio-panel studio-distribution-fieldset">
            <legend>{messages.studio.distribution}</legend>
            <p>{copy.distributionHelp}</p>
            {socialChannels.map((channel) => (
              <label className="studio-check" key={channel}>
                <input
                  defaultChecked={article?.distribution.includes(channel)}
                  name="distribution"
                  type="checkbox"
                  value={channel}
                />
                <span aria-hidden="true">
                  <Check size={14} />
                </span>
                {channel === "newsletter" ? messages.studio.newsletter : channel}
              </label>
            ))}
            {fieldError("distribution")}
          </fieldset>

          {article ? (
            <section className="studio-panel studio-danger-zone">
              <h2>{messages.studio.deleteArticle}</h2>
              <p>{messages.studio.deleteConfirmation}</p>
              <DeleteArticleForm articleId={article.id} locale={locale} messages={messages} />
            </section>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
