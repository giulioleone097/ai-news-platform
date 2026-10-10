"use client";

import { useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import type { Messages } from "@/i18n";
import {
  claimStatuses,
  storyLimits,
  type Article,
  type ClaimStatus,
} from "@atlasnews/core/editorial/domain/article";
import { entityKinds, type EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import "./story-fields.css";

interface SourceRow {
  key: number;
  title: string;
  url: string;
  supports: string;
}

/** The story fields of the article form: status, key points, sources and linked entities. */
export function StoryFields({
  article,
  entities,
  errors,
  messages,
}: {
  article?: Article;
  entities: EntitySummary[];
  errors?: Record<string, string[]>;
  messages: Messages;
}) {
  const copy = messages.studio;
  const addButton = useRef<HTMLButtonElement>(null);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>(article?.claimStatus ?? "analysis");
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
    <section className="studio-panel" aria-labelledby="story-fields-title">
      <div className="studio-panel__heading">
        <span>04</span>
        <h2 id="story-fields-title">{copy.storyPanel}</h2>
      </div>

      <label className="studio-field">
        <span>{copy.claimStatusLabel}</span>
        <select
          aria-describedby="story-claim-status-help"
          name="claimStatus"
          onChange={(event) => setClaimStatus(event.target.value as ClaimStatus)}
          value={claimStatus}
        >
          {claimStatuses.map((status) => (
            <option key={status} value={status}>
              {messages.story.claimStatus[status]}
            </option>
          ))}
        </select>
        <small id="story-claim-status-help">{copy.claimStatusHelp}</small>
      </label>

      <fieldset className="story-fieldset" aria-describedby={describedBy("keyPoints")}>
        <legend>{copy.keyPointsLabel}</legend>
        <p>{copy.keyPointsHelp}</p>
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
        <legend>{copy.sourcesLabel}</legend>
        <p>{copy.sourcesHelp}</p>
        {sources.map((source, index) => (
          <div className="story-source" key={source.key} role="group" aria-label={`${copy.sourceNumber} ${index + 1}`}>
            <div className="story-source__header">
              <span>{`${copy.sourceNumber} ${index + 1}`}</span>
              <button
                aria-label={`${copy.removeSource} ${index + 1}`}
                className="studio-button studio-button--secondary"
                onClick={() => {
                  setSources((rows) => rows.filter((row) => row.key !== source.key));
                  addButton.current?.focus();
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} />
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
            className="studio-button studio-button--secondary"
            onClick={() => {
              setNextKey(nextKey + 1);
              setNewSourceKey(nextKey);
              setSources((rows) => [...rows, { key: nextKey, title: "", url: "", supports: "" }]);
            }}
            ref={addButton}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            {copy.addSource}
          </button>
        ) : null}
      </fieldset>

      <fieldset className="story-fieldset" aria-describedby={describedBy("entities")}>
        <legend>{copy.entitiesLabel}</legend>
        <p>{copy.entitiesHelp}</p>
        {entities.length ? null : <p>{copy.noEntities}</p>}
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
                      <span aria-hidden="true">
                        <Check size={14} />
                      </span>
                      {entity.name}
                      {entity.parent ? <small>{` · ${entity.parent.name}`}</small> : null}
                    </label>
                    <label className="story-entity__primary">
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
