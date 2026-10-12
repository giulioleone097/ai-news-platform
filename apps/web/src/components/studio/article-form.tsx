"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { Locale, Messages } from "@/i18n";
import { parseUtcDateTimeInput, toUtcDateTimeInput } from "@/lib/editorial-datetime";
import type { ArticleFormFill, ArticleFormPatch, ArticleFormSnapshot } from "@atlasnews/contract/page";
import type { Article, Category, ClaimStatus, SocialChannel } from "@atlasnews/core/editorial/domain/article";
import type { EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import {
  articleLimits,
  articleStatuses,
  claimStatuses,
  slugPattern,
  socialChannels,
} from "@atlasnews/core/editorial/domain/article";
import { saveArticleAction } from "@/app/[locale]/(studio)/studio/actions";
import { StoryFields, type StoryFieldsHandle } from "@/app/[locale]/(studio)/studio/articles/story-fields";
import { StatusGlyph } from "@/components/site/claim-chip";
import { idleStudioActionState } from "./action-state";
import "./article-form.css";
import { DeleteArticleButton } from "./delete-article-button";
import { MarkdownEditor, type MarkdownEditorHandle } from "./markdown-editor";
import { MediaPicker } from "./media-picker";
import { Note } from "./note";
import { PageHead } from "./page-head";
import { checkFill, registerOpenArticleForm } from "./site-tools/article-form-bridge";
import { studioSupplementalCopy } from "./studio-copy";
import { StudioSubmitButton } from "./studio-submit-button";
import { counterpartLocale, type TranslationChoices } from "./translation-choices";

const channelLabels = { linkedin: "LinkedIn", x: "X", whatsapp: "WhatsApp" } as const;

/** Below this width the settings sit under the title and the extras fold away (see article-form.css). */
const wideQuery = "(min-width: 64rem)";

function subscribeToWide(onChange: () => void) {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isWide = () => window.matchMedia(wideQuery).matches;

/** What the Save button does at the publication state in the form. */
function saveLabel(messages: Messages, status: Article["status"], savedStatus?: Article["status"]) {
  if (status === "draft") return messages.studio.saveDraft;
  if (status === "scheduled") return messages.studio.schedule;
  if (status === "published" && savedStatus !== "published") return messages.studio.publish;
  return messages.common.save;
}

export function ArticleForm({
  article,
  categories,
  entities,
  locale,
  messages,
  saved = false,
  translations,
}: {
  article?: Article;
  categories: Record<Locale, Category[]>;
  entities: EntitySummary[];
  locale: Locale;
  messages: Messages;
  /** The save action redirected here with `?saved=1`. */
  saved?: boolean;
  /** What the "Translation of" field offers in each language, and the choice already made. */
  translations: { choices: TranslationChoices; selected: string };
}) {
  const [state, formAction] = useActionState(saveArticleAction, idleStudioActionState);
  const [articleLocale, setArticleLocale] = useState<Locale>(article?.locale ?? locale);
  const [categorySlug, setCategorySlug] = useState(
    article?.category.slug ?? categories[articleLocale][0]?.slug ?? "",
  );
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [status, setStatus] = useState(article?.status ?? "draft");
  const [scheduledFor, setScheduledFor] = useState(toUtcDateTimeInput(article?.scheduledFor ?? null));
  // A new article has no cover: the repository stores the default picture when none is given.
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "");
  const [coverAlt, setCoverAlt] = useState(article?.coverAlt ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | "">(article?.claimStatus ?? "");
  const [translationOf, setTranslationOf] = useState(translations.selected);
  const content = useRef<MarkdownEditorHandle>(null);
  const story = useRef<StoryFieldsHandle>(null);
  // The checkboxes keep the browser's own state, as they always did; the page tools reach them through these.
  const featured = useRef<HTMLInputElement>(null);
  const channels = useRef(new Map<SocialChannel, HTMLInputElement>());
  const wide = useSyncExternalStore(subscribeToWide, isWide, () => false);
  const copy = studioSupplementalCopy[locale];
  const optional = <span className="studio-field__optional"> ({copy.optional})</span>;
  const withRange = (text: string, limit: { min: number; max: number }) =>
    text.replace("{min}", String(limit.min)).replace("{max}", String(limit.max));
  const translationChoices = translations.choices[counterpartLocale(articleLocale)];
  // When creating worked but going live failed, the article exists: the next save updates it.
  const articleId = state.articleId ?? article?.id;

  const fieldHasError = (name: string) => Boolean(state.fieldErrors?.[name]?.length);
  const fieldErrorId = (name: string) => `article-${name}-error`;
  const fieldAccessibility = (name: string, hintId?: string) => ({
    "aria-describedby": [hintId, fieldHasError(name) ? fieldErrorId(name) : undefined].filter(Boolean).join(" ") || undefined,
    "aria-invalid": fieldHasError(name) || undefined,
  });
  const fieldError = (name: string, message?: string) =>
    fieldHasError(name) ? (
      <span className="studio-field__error" id={fieldErrorId(name)}>
        {message ?? state.fieldErrors?.[name]?.[0]}
      </span>
    ) : null;
  // The note belongs to the save that just happened: drop the flag so a reload does not repeat it.
  useEffect(() => {
    if (saved) window.history.replaceState(null, "", window.location.pathname);
  }, [saved]);
  const hasCover = /^(\/|https?:\/\/)/.test(coverImage);

  // The Studio's page tools (docs/SITE_TOOLS.md) read and fill the form through this reader and writer while it is mounted.
  const fieldsOnScreen = (): ArticleFormSnapshot["fields"] => ({
    title,
    slug,
    excerpt,
    content: content.current?.read() ?? "",
    categorySlug,
    status,
    scheduledFor: status === "scheduled" ? parseUtcDateTimeInput(scheduledFor) : null,
    translationOf: translationOf || null,
    claimStatus: claimStatus || null,
    featured: Boolean(featured.current?.checked),
    coverImage: coverImage || null,
    coverAlt,
    distribution: socialChannels.filter((channel) => channels.current.get(channel)?.checked),
    keyPoints: [],
    sources: [],
    entities: [],
    ...story.current?.read(),
  });
  // What the form held when it was shown or last saved, to tell whether the person has unsaved changes.
  const shownFields = useRef("");
  const rememberShownFields = useEffectEvent(() => {
    shownFields.current = JSON.stringify(fieldsOnScreen());
  });
  useEffect(() => rememberShownFields(), [article?.id, article?.updatedAt]);
  useEffect(() =>
    registerOpenArticleForm({
      read: () => {
        const fields = fieldsOnScreen();
        return {
          locale: articleLocale,
          article: article ? { id: article.id, slug: article.slug, locale: article.locale, status: article.status } : null,
          unsaved: JSON.stringify(fields) !== shownFields.current,
          fields,
          errors: state.fieldErrors ?? {},
          ...(state.status === "error" && state.message ? { message: state.message } : {}),
        };
      },
      fill: (patch: ArticleFormPatch): ArticleFormFill => {
        const { accepted, filled, rejected } = checkFill(patch, {
          categories: categories[articleLocale].map((category) => category.slug),
          translations: translationChoices.map((choice) => choice.slug),
          entities: entities.map((entity) => entity.slug),
        });
        // Synchronous, so that a read right after the fill sees the new values.
        flushSync(() => {
          if (accepted.title !== undefined) setTitle(accepted.title);
          if (accepted.slug !== undefined) setSlug(accepted.slug);
          if (accepted.excerpt !== undefined) setExcerpt(accepted.excerpt);
          if (accepted.content !== undefined) content.current?.write(accepted.content);
          if (accepted.categorySlug !== undefined) setCategorySlug(accepted.categorySlug);
          if (accepted.status !== undefined) setStatus(accepted.status);
          if (accepted.scheduledFor !== undefined) setScheduledFor(toUtcDateTimeInput(accepted.scheduledFor));
          if (accepted.translationOf !== undefined) setTranslationOf(accepted.translationOf ?? "");
          if (accepted.claimStatus !== undefined) setClaimStatus(accepted.claimStatus);
          if (accepted.featured !== undefined && featured.current) featured.current.checked = accepted.featured;
          if (accepted.coverImage !== undefined) {
            setCoverImage(accepted.coverImage ?? "");
            if (accepted.coverImage === null) setCoverAlt("");
          }
          if (accepted.coverAlt !== undefined) setCoverAlt(accepted.coverAlt);
          for (const [channel, box] of channels.current) {
            if (accepted.distribution) box.checked = accepted.distribution.includes(channel);
          }
          story.current?.fill(accepted);
        });
        return { filled, rejected, saved: false };
      },
    }),
  );

  return (
    // React resets a form after its action, even when the action refused it. The reset would put the fields back
    // to their first values, and the person (or an agent) would lose what was filled in: a refused save changes nothing.
    <form className="studio-editor" action={formAction} noValidate onReset={(event) => event.preventDefault()}>
      {articleId ? <input name="id" type="hidden" value={articleId} /> : null}

      <PageHead
        back={{ href: `/${locale}/studio/articles`, label: messages.studio.articles }}
        title={article?.title ?? messages.studio.newArticle}
      />

      {saved && article ? (
        <Note tone="success">
          {messages.studio.articleSaved}
          {article.status === "published" ? (
            <>
              {" "}
              <Link href={`/${locale}/articles/${article.slug}`}>{messages.studio.viewOnSite}</Link>
            </>
          ) : null}
        </Note>
      ) : null}

      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}

      <div className="article-editor">
        <section className="studio-section article-editor__intro">
          <label className="studio-field studio-field--title">
            <span>{messages.studio.titleLabel}</span>
            <input
              {...fieldAccessibility("title", "article-title-help")}
              maxLength={articleLimits.title.max}
              minLength={articleLimits.title.min}
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
            <small className="studio-field__hint" id="article-title-help">{withRange(copy.titleHelp, articleLimits.title)}</small>
            {fieldError("title")}
          </label>

          <label className="studio-field">
            <span>{messages.studio.slugLabel}{optional}</span>
            <input
              {...fieldAccessibility("slug", "article-slug-help")}
              maxLength={articleLimits.slug.max}
              name="slug"
              onChange={(event) => setSlug(event.target.value)}
              pattern={slugPattern.source.slice(1, -1)}
              value={slug}
            />
            <small className="studio-field__hint" id="article-slug-help">{copy.slugHelp}</small>
            {fieldError("slug")}
          </label>

          <label className="studio-field">
            <span>{messages.studio.excerptLabel}</span>
            <textarea
              {...fieldAccessibility("excerpt", "article-excerpt-help")}
              maxLength={articleLimits.excerpt.max}
              minLength={articleLimits.excerpt.min}
              name="excerpt"
              onChange={(event) => setExcerpt(event.target.value)}
              required
              rows={3}
              value={excerpt}
            />
            <small className="studio-field__hint" id="article-excerpt-help">{withRange(copy.excerptHelp, articleLimits.excerpt)}</small>
            {fieldError("excerpt")}
          </label>
        </section>

        <div className="article-editor__panel">
          <section className="studio-section article-editor__publish" aria-labelledby="article-publishing-title">
            <h2 className="studio-section__title" id="article-publishing-title">{copy.publishing}</h2>

            <label className="studio-field">
              <span>{copy.publicationLabel}</span>
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
                          : messages.studio.statusReview}
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
                  name="scheduledFor"
                  onChange={(event) => setScheduledFor(event.target.value)}
                  required
                  type="datetime-local"
                  value={scheduledFor}
                />
                {fieldError("scheduledFor")}
              </label>
            ) : (
              <input name="scheduledFor" type="hidden" value="" />
            )}

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
                    setTranslationOf("");
                  }}
                  value={articleLocale}
                >
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                </select>
              )}
              {fieldError("locale")}
            </label>

            {translationChoices.length || translationOf ? (
              <label className="studio-field">
                <span>{copy.translationOfLabel}{optional}</span>
                <select
                  {...fieldAccessibility("translationOf", "article-translation-help")}
                  name="translationOf"
                  onChange={(event) => setTranslationOf(event.target.value)}
                  value={translationOf}
                >
                  <option value="">{copy.translationOfNone}</option>
                  {translationChoices.map((choice) => (
                    <option key={choice.slug} value={choice.slug}>{choice.title}</option>
                  ))}
                </select>
                <small className="studio-field__hint" id="article-translation-help">{copy.translationOfHelp}</small>
                {fieldError("translationOf")}
              </label>
            ) : null}

            <label className="studio-field">
              <span>{messages.studio.claimStatusLabel}</span>
              <span className="article-claim">
                <select
                  {...fieldAccessibility("claimStatus", "article-claim-help")}
                  className="article-claim__select"
                  name="claimStatus"
                  onChange={(event) => setClaimStatus(event.target.value as ClaimStatus)}
                  required
                  value={claimStatus}
                >
                  {claimStatus ? null : <option value="">{copy.claimChoose}</option>}
                  {claimStatuses.map((claim) => (
                    <option key={claim} value={claim}>
                      {messages.story.claimStatus[claim]}
                    </option>
                  ))}
                </select>
                {claimStatus ? (
                  <span className="article-claim__glyph"><StatusGlyph status={claimStatus} /></span>
                ) : null}
              </span>
              <small className="studio-field__hint" id="article-claim-help">{messages.studio.claimStatusHelp}</small>
              {fieldError("claimStatus", copy.claimRequired)}
            </label>
          </section>

          <div className="studio-buttons article-editor__actions">
            <StudioSubmitButton
              idleLabel={saveLabel(messages, status, article?.status)}
              pendingLabel={messages.studio.saving}
            />
            <Link className="button button--quiet" href={`/${locale}/studio/articles`}>
              {messages.common.cancel}
            </Link>
          </div>

          <details
            className="article-editor__extras"
            open={wide || fieldHasError("distribution") || undefined}
          >
            <summary>{copy.moreOptions}</summary>
            <div className="article-editor__extras-body">
              <label className="studio-check">
                <input defaultChecked={article?.featured} name="featured" ref={featured} type="checkbox" />
                {copy.featuredLabel}
              </label>

              <fieldset className="article-editor__share">
                <legend>{copy.shareOn}</legend>
                <p className="studio-muted">{copy.distributionHelp}</p>
                <div>
                  {socialChannels.map((channel) => (
                    <label className="studio-check" key={channel}>
                      <input
                        {...fieldAccessibility("distribution")}
                        defaultChecked={article?.distribution.includes(channel)}
                        name="distribution"
                        ref={(box) => {
                          if (box) channels.current.set(channel, box);
                          else channels.current.delete(channel);
                        }}
                        type="checkbox"
                        value={channel}
                      />
                      {channel === "newsletter" ? messages.studio.newsletter : channelLabels[channel]}
                    </label>
                  ))}
                </div>
                {fieldError("distribution")}
              </fieldset>
            </div>
          </details>

          {article ? (
            <div className="article-editor__danger">
              <DeleteArticleButton locale={locale} messages={messages} title={article.title} />
            </div>
          ) : null}
        </div>

        <div className="article-editor__body">
          <section className="studio-section">
            <MarkdownEditor
              copy={copy.markdown}
              defaultValue={article?.content}
              error={fieldError("content")}
              errorId={fieldErrorId("content")}
              help={copy.contentHelp}
              invalid={fieldHasError("content")}
              label={messages.studio.bodyLabel}
              ref={content}
            />
          </section>

          <section className="studio-section" aria-labelledby="story-media-title">
            <h2 className="studio-section__title" id="story-media-title">{copy.coverTitle}</h2>
            <div className="article-cover">
              {hasCover ? (
                <Image alt="" className="article-cover__thumb" height={180} src={coverImage} unoptimized width={320} />
              ) : (
                <p className="article-cover__empty">{copy.coverEmpty}</p>
              )}
              <div className="article-cover__actions">
                <button className="button button--quiet" onClick={() => setPickerOpen(true)} type="button">
                  {copy.coverChoose}
                </button>
                {coverImage ? (
                  <button
                    className="button button--quiet"
                    onClick={() => {
                      setCoverImage("");
                      setCoverAlt("");
                    }}
                    type="button"
                  >
                    {copy.coverRemove}
                  </button>
                ) : null}
              </div>
            </div>

            <details className="article-cover__url" open={fieldHasError("coverImage") || undefined}>
              <summary>{copy.coverUseUrl}</summary>
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
            </details>

            {coverImage ? (
              <label className="studio-field">
                <span>{copy.coverAltLabel}</span>
                <input
                  {...fieldAccessibility("coverAlt", "article-cover-alt-help")}
                  maxLength={articleLimits.coverAlt.max}
                  minLength={articleLimits.coverAlt.min}
                  name="coverAlt"
                  onChange={(event) => setCoverAlt(event.target.value)}
                  required
                  value={coverAlt}
                />
                <small className="studio-field__hint" id="article-cover-alt-help">{copy.coverAltHelp}</small>
                {fieldError("coverAlt")}
              </label>
            ) : (
              // The server asks for a description even when the default picture is used.
              <input name="coverAlt" type="hidden" value={copy.coverDefaultAlt} />
            )}
            <MediaPicker
              copy={{ ...copy.markdown.images, insert: copy.coverUse }}
              locale={locale}
              onClose={() => setPickerOpen(false)}
              onInsert={(_markdown, image) => {
                setCoverImage(image.url);
                setCoverAlt(image.alt);
                setPickerOpen(false);
              }}
              open={pickerOpen}
              title={copy.coverPickerTitle}
            />
          </section>

          <StoryFields
            article={article}
            entities={entities}
            errors={state.fieldErrors}
            messages={messages}
            optional={copy.optional}
            ref={story}
          />
        </div>
      </div>
    </form>
  );
}
