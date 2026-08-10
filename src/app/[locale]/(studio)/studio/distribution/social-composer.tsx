"use client";

import { BriefcaseBusiness, Check, Clock3, MessageCircle, ScanText, Send, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import type { SocialProvider } from "@/modules/social-publishing/domain/social-publication";
import { submitSocialPublicationAction } from "./social-actions";
import styles from "./distribution.module.css";
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
    <section className={styles.composer} aria-labelledby="social-composer-title">
      <div className={styles.sectionHeading}>
        <span className={styles.sectionNumber}>01</span>
        <div>
          <h2 id="social-composer-title">{copy.composerTitle}</h2>
          <p>{copy.composerDescription}</p>
        </div>
      </div>

      <form action={action} className={styles.composerForm}>
        <input name="locale" type="hidden" value={copy.locale} />
        <input name="provider" type="hidden" value={provider} />
        <input name="jobId" type="hidden" value={recoverableJob?.id ?? ""} />
        <input name="expectedRevision" type="hidden" value={recoverableJob?.expectedRevision ?? ""} />

        <fieldset className={styles.channelFieldset}>
          <legend>{copy.channel}</legend>
          <div className={styles.channelGrid}>
            {(Object.keys(providerLabels) as SocialProvider[]).map((channel) => {
              const Icon = providerIcons[channel];
              const configured = configuredProviders.includes(channel);
              return (
                <button
                  aria-pressed={provider === channel}
                  className={`${styles.channelButton} ${provider === channel ? styles.channelButtonActive : ""}`}
                  disabled={!configured || pending}
                  key={channel}
                  onClick={() => chooseProvider(channel)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} />
                  <span>{providerLabels[channel]}</span>
                  <small>{configured ? copy.configured : copy.unavailable}</small>
                </button>
              );
            })}
          </div>
        </fieldset>

        {canSubmit ? (
          <div className={styles.composerFields}>
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
                rows={7}
                value={text}
              />
              <small className={styles.fieldMeta}>
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
              <span>{copy.schedule}</span>
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

            <label className={styles.confirmation}>
              <input
                checked={confirmed}
                name="confirm"
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                type="checkbox"
              />
              <span><ShieldCheck aria-hidden="true" size={18} />{copy.confirm}</span>
            </label>
            {recoverableJob ? <p className={styles.inlineEmpty}>{copy.requeueNotice}</p> : null}
            {error("confirm") ? <small className="studio-field__error">{error("confirm")}</small> : null}

            <div className={styles.composerActions}>
              <button
                className="studio-button studio-button--secondary"
                disabled={pending}
                name="intent"
                type="submit"
                value="preview"
              >
                <ScanText aria-hidden="true" size={16} />
                {pending ? copy.pending : copy.preview}
              </button>
              <button
                className="studio-button studio-button--primary"
                disabled={pending || !confirmed}
                name="intent"
                type="submit"
                value={recoverableJob ? "requeue" : "enqueue"}
              >
                <Send aria-hidden="true" size={16} />
                {pending ? copy.pending : recoverableJob ? copy.requeue : copy.queue}
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.inlineEmpty}>{copy.emptyPublications}</p>
        )}

        {state.status === "error" && state.message ? (
          <p className="studio-alert studio-alert--error" role="alert">{state.message}</p>
        ) : null}

        {state.status === "preview" && state.preview ? (
          <aside className={styles.preview} aria-live="polite">
            <div className={styles.previewHeading}>
              <span><Check aria-hidden="true" size={15} />{copy.validated}</span>
              <strong>{copy.previewTitle}</strong>
            </div>
            <p className={styles.previewText}>{state.preview.text}</p>
            <div className={styles.previewMeta}>
              {state.preview.articleUrl ? <span><Send aria-hidden="true" size={14} />{copy.canonicalLink}</span> : null}
              {state.preview.recipient ? <span><ShieldCheck aria-hidden="true" size={14} />{copy.recipientRedacted}</span> : null}
              {state.preview.scheduledFor ? <span><Clock3 aria-hidden="true" size={14} />{state.preview.scheduledFor}</span> : null}
            </div>
          </aside>
        ) : null}

        {state.status === "queued" && state.readback ? (
          <p className="studio-alert studio-alert--success" aria-live="polite">
            <Check aria-hidden="true" size={16} />
            {providerLabels[state.readback.provider]} · {state.readback.status} · {state.readback.availableAt}
          </p>
        ) : null}
      </form>
    </section>
  );
}
