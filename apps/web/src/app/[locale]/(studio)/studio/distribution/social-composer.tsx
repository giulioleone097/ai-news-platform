"use client";

import { BriefcaseBusiness, Check, MessageCircle, ScanText, Send } from "lucide-react";
import { useActionState, useState } from "react";
import type { SocialProvider } from "@atlasnews/core/social-publishing/domain/social-publication";
import { submitSocialPublicationAction } from "./social-actions";
import { Note } from "@/components/studio/note";
import {
  idleSocialComposerState,
  type SocialComposerPublication,
  type SocialDistributionCopy,
} from "./types";

const providerLabels: Record<SocialProvider, string> = {
  linkedin: "LinkedIn",
  x: "X",
  whatsapp: "WhatsApp",
};

const providerLimits: Record<SocialProvider, number> = {
  linkedin: 3_000,
  x: 280,
  whatsapp: 4_096,
};

const providerIcons = {
  linkedin: BriefcaseBusiness,
  x: Send,
  whatsapp: MessageCircle,
} as const;

export function SocialComposer({
  configuredProviders,
  copy,
  publications,
}: {
  configuredProviders: SocialProvider[];
  copy: SocialDistributionCopy;
  publications: SocialComposerPublication[];
}) {
  const initialProvider = configuredProviders.find((provider) => (
    publications.some((publication) => publication.provider === provider)
  )) ?? configuredProviders[0] ?? "linkedin";
  const initialPublication = publications.find((publication) => publication.provider === initialProvider);
  const [provider, setProvider] = useState<SocialProvider>(initialProvider);
  const [publicationId, setPublicationId] = useState(initialPublication?.id ?? "");
  const [text, setText] = useState(initialPublication?.defaultText ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(
    submitSocialPublicationAction,
    idleSocialComposerState,
  );

  const providerPublications = publications.filter((publication) => publication.provider === provider);
  const selectedPublication = providerPublications.find((publication) => publication.id === publicationId);
  const recoverableJob = selectedPublication?.recoverableJob ?? null;
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  const canSubmit = Boolean(selectedPublication) && configuredProviders.includes(provider);

  function chooseProvider(nextProvider: SocialProvider) {
    const nextPublication = publications.find((publication) => publication.provider === nextProvider);
    setProvider(nextProvider);
    setPublicationId(nextPublication?.id ?? "");
    setText(nextPublication?.defaultText ?? "");
    setConfirmed(false);
  }

  function choosePublication(nextId: string) {
    const nextPublication = providerPublications.find((publication) => publication.id === nextId);
    setPublicationId(nextId);
    setText(nextPublication?.defaultText ?? "");
    setConfirmed(false);
  }

  return (
    <section className="studio-stack" aria-labelledby="social-composer-title">
      <div className="studio-section__head">
        <h2 className="studio-section__title" id="social-composer-title">{copy.composerTitle}</h2>
        <p>{copy.composerDescription}</p>
      </div>

      <form action={action} className="studio-composer">
        <input name="locale" type="hidden" value={copy.locale} />
        <input name="provider" type="hidden" value={provider} />
        <input name="jobId" type="hidden" value={recoverableJob?.id ?? ""} />
        <input name="expectedRevision" type="hidden" value={recoverableJob?.expectedRevision ?? ""} />

        <fieldset className="studio-field">
          <legend className="studio-label">{copy.channel}</legend>
          <div className="studio-segmented">
            {(Object.keys(providerLabels) as SocialProvider[]).map((channel) => {
              const Icon = providerIcons[channel];
              const configured = configuredProviders.includes(channel);
              return (
                <button
                  aria-pressed={provider === channel}
                  disabled={!configured || pending}
                  key={channel}
                  onClick={() => chooseProvider(channel)}
                  title={configured ? undefined : copy.unavailable}
                  type="button"
                >
                  <Icon aria-hidden="true" />
                  {providerLabels[channel]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {canSubmit ? (
          <>
            <label className="studio-field">
              <span>{copy.story}</span>
              <select
                name="publicationId"
                onChange={(event) => choosePublication(event.currentTarget.value)}
                required
                value={publicationId}
              >
                {providerPublications.map((publication) => (
                  <option key={publication.id} value={publication.id}>{publication.articleTitle}</option>
                ))}
              </select>
            </label>

            <label className="studio-field">
              <span>{copy.message}</span>
              <textarea
                aria-describedby="social-message-help"
                aria-invalid={Boolean(error("text")) || undefined}
                maxLength={providerLimits[provider]}
                name="text"
                onChange={(event) => {
                  setText(event.currentTarget.value);
                  setConfirmed(false);
                }}
                required
                rows={6}
                value={text}
              />
              <small className="studio-composer__meta">
                <span id="social-message-help">{copy.messageHelp}</span>
                <span>{Array.from(text).length}/{providerLimits[provider]}</span>
              </small>
              {error("text") ? <small className="studio-field__error">{error("text")}</small> : null}
            </label>

            {provider === "whatsapp" ? (
              <label className="studio-field">
                <span>{copy.recipient}</span>
                <input
                  aria-describedby="social-recipient-help"
                  aria-invalid={Boolean(error("recipient")) || undefined}
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={16}
                  name="recipient"
                  onChange={() => setConfirmed(false)}
                  placeholder="+15551234567"
                  required
                  type="tel"
                />
                <small id="social-recipient-help">{copy.recipientHelp}</small>
                {error("recipient") ? <small className="studio-field__error">{error("recipient")}</small> : null}
              </label>
            ) : null}

            <label className="studio-field">
              <span>{copy.schedule} <span className="studio-field__optional">({copy.optional})</span></span>
              <input
                aria-describedby="social-schedule-help"
                aria-invalid={Boolean(error("scheduledFor")) || undefined}
                name="scheduledFor"
                onChange={() => setConfirmed(false)}
                type="datetime-local"
              />
              <small id="social-schedule-help">{copy.scheduleHelp}</small>
              {error("scheduledFor") ? <small className="studio-field__error">{error("scheduledFor")}</small> : null}
            </label>

            <label className="studio-check">
              <input
                checked={confirmed}
                name="confirm"
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                type="checkbox"
              />
              {copy.confirm}
            </label>
            {recoverableJob ? <p className="studio-muted">{copy.requeueNotice}</p> : null}
            {error("confirm") ? <small className="studio-field__error">{error("confirm")}</small> : null}

            <div className="studio-inline">
              <button
                className="button button--quiet"
                disabled={pending}
                name="intent"
                type="submit"
                value="preview"
              >
                <ScanText aria-hidden="true" />
                {pending ? copy.pending : copy.preview}
              </button>
              <button
                className="button button--primary"
                disabled={pending || !confirmed}
                name="intent"
                type="submit"
                value={recoverableJob ? "requeue" : "enqueue"}
              >
                <Send aria-hidden="true" />
                {pending ? copy.pending : recoverableJob ? copy.requeue : copy.queue}
              </button>
            </div>
          </>
        ) : (
          <p className="studio-muted">{copy.emptyPublications}</p>
        )}

        {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}

        {state.status === "preview" && state.preview ? (
          <aside className="studio-composer__preview" aria-live="polite">
            <p className="studio-badge" data-tone="success">
              <Check aria-hidden="true" size={14} /> {copy.validated}
            </p>
            <h3>{copy.previewTitle}</h3>
            <p className="studio-text">{state.preview.text}</p>
            <p className="studio-meta">
              {state.preview.articleUrl ? <span>{copy.canonicalLink}</span> : null}
              {state.preview.recipient ? <span>{copy.recipientRedacted}</span> : null}
              {state.preview.scheduledFor ? <span>{state.preview.scheduledFor}</span> : null}
            </p>
          </aside>
        ) : null}

        {state.status === "queued" && state.readback ? (
          <Note tone="success">
            {providerLabels[state.readback.provider]} · {state.readback.status} · {state.readback.availableAt}
          </Note>
        ) : null}
      </form>
    </section>
  );
}
