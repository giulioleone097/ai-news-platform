"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Messages } from "@/i18n";
import {
  storyLimits,
  type Article,
} from "@atlasnews/core/editorial/domain/article";
import { entityKinds, type EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import "./story-fields.css";

interface SourceRow {
  key: number;
  title: string;
  url: string;
  supports: string;
}

/** The story fields of the article form: key points, sources and linked entities. */
export function StoryFields({
  article,
  entities,
  errors,
  messages,
  optional,
}: {
  article?: Article;
  entities: EntitySummary[];
  errors?: Record<string, string[]>;
  messages: Messages;
  /** The word that marks these three lists as optional. */
  optional: string;
}) {
  const copy = messages.studio;
  const addButton = useRef<HTMLButtonElement>(null);
  const [keyPoints, setKeyPoints] = useState(() =>
    Array.from({ length: storyLimits.keyPoints.count }, (_, index) => article?.keyPoints[index] ?? ""),
  );
  const [sources, setSources] = useState<SourceRow[]>(() =>
    (article?.sources ?? []).map((source, index) => ({ ...source, key: index })),
  );
  const [nextKey, setNextKey] = useState(article?.sources.length ?? 0);
  const [newSourceKey, setNewSourceKey] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>(() =>
    (article?.entities ?? []).map((entity) => entity.slug),
  );
  const [primary, setPrimary] = useState(
    article?.entities.find((entity) => entity.isPrimary)?.slug ?? article?.entities[0]?.slug ?? "",
  );

  const toggleEntity = (slug: string, checked: boolean) => {
    const next = checked ? [...selected, slug] : selected.filter((item) => item !== slug);
    setSelected(next);
    if (!next.includes(primary)) setPrimary(next[0] ?? "");
  };
  const updateSource = (key: number, patch: Partial<SourceRow>) =>
    setSources((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const error = (name: string) => errors?.[name]?.[0];
  const errorId = (name: string) => `story-${name}-error`;
  const describedBy = (name: string) => (error(name) ? errorId(name) : undefined);
  const renderError = (name: string) =>
    error(name) ? (
      <span className="studio-field__error" id={errorId(name)} role="alert">
        {error(name)}
      </span>
    ) : null;

  return (
    <section className="studio-section" aria-labelledby="story-fields-title">
      <h2 className="studio-section__title" id="story-fields-title">{copy.storyPanel}</h2>

      <fieldset className="story-fieldset" aria-describedby={describedBy("keyPoints")}>
        <legend>
          {copy.keyPointsLabel}
          <span className="studio-field__optional"> ({optional})</span>
        </legend>
        <p className="studio-muted">{copy.keyPointsHelp}</p>
        {keyPoints.map((point, index) => (
          <label className="studio-field" key={index}>
            <span>{`${copy.keyPointNumber} ${index + 1}`}</span>
            <input
              aria-invalid={error("keyPoints") ? true : undefined}
              maxLength={storyLimits.keyPoints.max}
              name="keyPoints"
              onChange={(event) =>
                setKeyPoints((points) => points.map((item, at) => (at === index ? event.target.value : item)))
              }
              value={point}
            />
          </label>
        ))}
        {renderError("keyPoints")}
      </fieldset>

      <fieldset className="story-fieldset" aria-describedby={describedBy("sources")}>
        <legend>
          {copy.sourcesLabel}
          <span className="studio-field__optional"> ({optional})</span>
        </legend>
        <p className="studio-muted">{copy.sourcesHelp}</p>
        {sources.map((source, index) => (
          <div className="story-source" key={source.key} role="group" aria-label={`${copy.sourceNumber} ${index + 1}`}>
            <div className="story-source__header">
              <span>{`${copy.sourceNumber} ${index + 1}`}</span>
              <button
                aria-label={`${copy.removeSource} ${index + 1}`}
                className="studio-icon-button studio-icon-button--danger"
                onClick={() => {
                  setSources((rows) => rows.filter((row) => row.key !== source.key));
                  addButton.current?.focus();
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
            <label className="studio-field">
              <span>{copy.sourceTitleLabel}</span>
              <input
                aria-invalid={error("sources") ? true : undefined}
                autoFocus={source.key === newSourceKey}
                maxLength={storyLimits.sources.titleMax}
                name="sourceTitle"
                onChange={(event) => updateSource(source.key, { title: event.target.value })}
                value={source.title}
              />
            </label>
            <label className="studio-field">
              <span>{copy.sourceUrlLabel}</span>
              <input
                aria-invalid={error("sources") ? true : undefined}
                inputMode="url"
                maxLength={storyLimits.sources.urlMax}
                name="sourceUrl"
                onChange={(event) => updateSource(source.key, { url: event.target.value })}
                placeholder="https://"
                type="url"
                value={source.url}
              />
            </label>
            <label className="studio-field">
              <span>{copy.sourceSupportsLabel}</span>
              <input
                aria-invalid={error("sources") ? true : undefined}
                maxLength={storyLimits.sources.supportsMax}
                name="sourceSupports"
                onChange={(event) => updateSource(source.key, { supports: event.target.value })}
                value={source.supports}
              />
            </label>
          </div>
        ))}
        {renderError("sources")}
        {sources.length < storyLimits.sources.count ? (
          <button
            className="button button--quiet button--small"
            onClick={() => {
              setNextKey(nextKey + 1);
              setNewSourceKey(nextKey);
              setSources((rows) => [...rows, { key: nextKey, title: "", url: "", supports: "" }]);
            }}
            ref={addButton}
            type="button"
          >
            <Plus aria-hidden="true" />
            {copy.addSource}
          </button>
        ) : null}
      </fieldset>

      <fieldset className="story-fieldset" aria-describedby={describedBy("entities")}>
        <legend>
          {copy.entitiesLabel}
          <span className="studio-field__optional"> ({optional})</span>
        </legend>
        <p className="studio-muted">{copy.entitiesHelp}</p>
        {entities.length ? null : <p className="studio-muted">{copy.noEntities}</p>}
        {entityKinds.map((kind) => {
          const group = entities.filter((entity) => entity.kind === kind);
          if (!group.length) return null;
          return (
            <div className="story-entity-group" key={kind}>
              <h3>{messages.story.entityKind[kind]}</h3>
              {group.map((entity) => {
                const checked = selected.includes(entity.slug);
                return (
                  <div className="story-entity" key={entity.slug}>
                    <label className="studio-check">
                      <input
                        checked={checked}
                        disabled={!checked && selected.length >= storyLimits.entities.count}
                        name="entity"
                        onChange={(event) => toggleEntity(entity.slug, event.target.checked)}
                        type="checkbox"
                        value={entity.slug}
                      />
                      {entity.name}
                      {entity.parent ? <small>{` · ${entity.parent.name}`}</small> : null}
                    </label>
                    <label className="studio-check story-entity__primary">
                      <input
                        aria-label={`${copy.entityPrimaryLabel}: ${entity.name}`}
                        checked={primary === entity.slug}
                        disabled={!checked}
                        name="primaryEntity"
                        onChange={() => setPrimary(entity.slug)}
                        type="radio"
                        value={entity.slug}
                      />
                      {copy.entityPrimaryLabel}
                    </label>
                  </div>
                );
              })}
            </div>
          );
        })}
        {renderError("entities")}
      </fieldset>
    </section>
  );
}
