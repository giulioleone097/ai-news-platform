"use client";

import { CalendarClock, Save, Send, XCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveNewsletterCampaignAction } from "@/app/[locale]/(studio)/studio/newsletter/campaigns/actions";
import { idleStudioActionState } from "@/components/studio/action-state";
import { MarkdownEditor, type MarkdownEditorCopy } from "@/components/studio/markdown-editor";
import type { Locale } from "@/i18n";
import { toUtcDateTimeInput } from "@/lib/editorial-datetime";
import type { NewsletterCampaign } from "@/modules/newsletter-delivery/domain";

const copy = {
  en: {
    subject: "Subject",
    preheader: "Preheader",
    sender: "Sender",
    fromName: "From name",
    fromEmail: "From email",
    replyTo: "Reply-to",
    audience: "Audience",
    audienceLocale: "Audience language",
    audienceStatus: "Subscription status",
    activeOnly: "Confirmed active subscribers",
    schedule: "Delivery schedule",
    scheduledFor: "Send at (UTC)",
    content: "Email content",
    contentHelp: "Markdown is rendered to safe email HTML. Raw HTML and remote images are omitted.",
    save: "Save draft",
    saving: "Saving…",
    working: "Working…",
    scheduleAction: "Schedule",
    send: "Queue now",
    cancel: "Cancel campaign",
    scheduleConfirm: "Schedule this campaign for the selected UTC time?",
    sendConfirm: "Freeze the current audience and queue this campaign for email delivery now?",
    cancelConfirm: "Cancel this campaign and every unsent delivery?",
    unavailable: "Campaign content is locked after it enters the delivery queue.",
    markdown: {
      toolbar: "Markdown formatting",
      viewMode: "Editor view",
      write: "Write",
      preview: "Preview",
      split: "Split",
      heading: "Section heading",
      bold: "Bold",
      italic: "Italic",
      strike: "Strikethrough",
      link: "Link",
      quote: "Quote",
      bullets: "Bulleted list",
      numbered: "Numbered list",
      checklist: "Task list",
      code: "Code",
      image: "Image",
      words: "words",
      characters: "characters",
      emptyPreview: "Start writing to see the rendered email.",
      imageUnavailable: "Image omitted from email",
    } satisfies MarkdownEditorCopy,
  },
  it: {
    subject: "Oggetto",
    preheader: "Preheader",
    sender: "Mittente",
    fromName: "Nome mittente",
    fromEmail: "Email mittente",
    replyTo: "Rispondi a",
    audience: "Pubblico",
    audienceLocale: "Lingua del pubblico",
    audienceStatus: "Stato iscrizione",
    activeOnly: "Iscritti attivi e confermati",
    schedule: "Programmazione",
    scheduledFor: "Invia alle (UTC)",
    content: "Contenuto email",
    contentHelp: "Il Markdown diventa HTML email sicuro. HTML grezzo e immagini remote vengono omessi.",
    save: "Salva bozza",
    saving: "Salvataggio…",
    working: "Elaborazione…",
    scheduleAction: "Programma",
    send: "Metti in coda",
    cancel: "Annulla campagna",
    scheduleConfirm: "Programmare la campagna per l’orario UTC selezionato?",
    sendConfirm: "Congelare il pubblico attuale e mettere ora la campagna in coda per l’invio email?",
    cancelConfirm: "Annullare la campagna e tutte le consegne non inviate?",
    unavailable: "Il contenuto è bloccato dopo l’ingresso nella coda di consegna.",
    markdown: {
      toolbar: "Formattazione Markdown",
      viewMode: "Vista editor",
      write: "Scrivi",
      preview: "Anteprima",
      split: "Affianca",
      heading: "Titolo di sezione",
      bold: "Grassetto",
      italic: "Corsivo",
      strike: "Barrato",
      link: "Link",
      quote: "Citazione",
      bullets: "Elenco puntato",
      numbered: "Elenco numerato",
      checklist: "Lista attività",
      code: "Codice",
      image: "Immagine",
      words: "parole",
      characters: "caratteri",
      emptyPreview: "Inizia a scrivere per vedere l’email.",
      imageUnavailable: "Immagine omessa dall’email",
    } satisfies MarkdownEditorCopy,
  },
} as const;

function CampaignButton({
  intent,
  label,
  className,
  confirmMessage,
  pendingLabel,
  icon: Icon,
}: {
  intent: "save" | "schedule" | "send" | "cancel";
  label: string;
  className: string;
  confirmMessage?: string;
  pendingLabel: string;
  icon: typeof Save;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      name="intent"
      onClick={(event) => {
        const confirmation = event.currentTarget.form?.elements.namedItem("confirmation");
        if (confirmation instanceof HTMLInputElement) confirmation.value = "";
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        if (confirmMessage && confirmation instanceof HTMLInputElement) {
          confirmation.value = intent;
        }
      }}
      type="submit"
      value={intent}
    >
      <Icon aria-hidden="true" size={16} />
      {pending ? pendingLabel : label}
    </button>
  );
}

export function NewsletterCampaignForm({
  campaign,
  defaults,
  locale,
}: {
  campaign?: NewsletterCampaign;
  defaults: { fromEmail: string; replyTo: string | null };
  locale: Locale;
}) {
  const [state, action] = useActionState(saveNewsletterCampaignAction, idleStudioActionState);
  const labels = copy[locale];
  const editable = !campaign || campaign.status === "draft";
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  const errorId = (field: string) => `campaign-${field}-error`;

  return (
    <form action={action} className="studio-editor">
      <input name="locale" type="hidden" value={locale} />
      <input name="confirmation" type="hidden" value="" />
      {campaign ? <input name="id" type="hidden" value={campaign.id} /> : null}

      {state.status === "error" && state.message ? (
        <p className="studio-alert studio-alert--error" role="alert">{state.message}</p>
      ) : null}

      {editable ? (
        <div className="studio-editor__grid">
          <div className="studio-editor__main">
            <section className="studio-panel" aria-labelledby="campaign-message-title">
              <div className="studio-panel__heading">
                <span>01</span>
                <h2 id="campaign-message-title">{labels.subject}</h2>
              </div>
              <label className="studio-field studio-field--title">
                <span>{labels.subject}</span>
                <input
                  aria-describedby={error("subject") ? errorId("subject") : undefined}
                  aria-invalid={Boolean(error("subject")) || undefined}
                  defaultValue={campaign?.subject}
                  maxLength={200}
                  name="subject"
                  required
                />
                {error("subject") ? <small className="studio-field__error" id={errorId("subject")}>{error("subject")}</small> : null}
              </label>
              <label className="studio-field">
                <span>{labels.preheader}</span>
                <textarea
                  aria-describedby={error("preheader") ? errorId("preheader") : undefined}
                  aria-invalid={Boolean(error("preheader")) || undefined}
                  defaultValue={campaign?.preheader}
                  maxLength={300}
                  name="preheader"
                  rows={3}
                />
                {error("preheader") ? <small className="studio-field__error" id={errorId("preheader")}>{error("preheader")}</small> : null}
              </label>
              <MarkdownEditor
                copy={labels.markdown}
                defaultValue={campaign?.contentMarkdown}
                error={error("contentMarkdown") ? <small className="studio-field__error" id={errorId("contentMarkdown")}>{error("contentMarkdown")}</small> : undefined}
                errorId={errorId("contentMarkdown")}
                help={labels.contentHelp}
                invalid={Boolean(error("contentMarkdown"))}
                label={labels.content}
              />
            </section>
          </div>

          <aside className="studio-editor__aside">
            <section className="studio-panel" aria-labelledby="campaign-sender-title">
              <div className="studio-panel__heading">
                <span>02</span>
                <h2 id="campaign-sender-title">{labels.sender}</h2>
              </div>
              <label className="studio-field">
                <span>{labels.fromName}</span>
                <input
                  aria-describedby={error("fromName") ? errorId("fromName") : undefined}
                  aria-invalid={Boolean(error("fromName")) || undefined}
                  defaultValue={campaign?.fromName ?? "NEURA"}
                  maxLength={120}
                  name="fromName"
                  required
                />
                {error("fromName") ? <small className="studio-field__error" id={errorId("fromName")}>{error("fromName")}</small> : null}
              </label>
              <label className="studio-field">
                <span>{labels.fromEmail}</span>
                <input defaultValue={campaign?.fromEmail ?? defaults.fromEmail} name="fromEmail" readOnly required type="email" />
              </label>
              <label className="studio-field">
                <span>{labels.replyTo}</span>
                <input
                  aria-describedby={error("replyTo") ? errorId("replyTo") : undefined}
                  aria-invalid={Boolean(error("replyTo")) || undefined}
                  defaultValue={campaign?.replyTo ?? defaults.replyTo ?? ""}
                  name="replyTo"
                  type="email"
                />
                {error("replyTo") ? <small className="studio-field__error" id={errorId("replyTo")}>{error("replyTo")}</small> : null}
              </label>
            </section>

            <section className="studio-panel" aria-labelledby="campaign-audience-title">
              <div className="studio-panel__heading">
                <span>03</span>
                <h2 id="campaign-audience-title">{labels.audience}</h2>
              </div>
              <label className="studio-field">
                <span>{labels.audienceLocale}</span>
                <select
                  aria-describedby={error("audienceLocale") ? errorId("audienceLocale") : undefined}
                  aria-invalid={Boolean(error("audienceLocale")) || undefined}
                  defaultValue={campaign?.audienceLocale ?? locale}
                  name="audienceLocale"
                >
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                </select>
                {error("audienceLocale") ? <small className="studio-field__error" id={errorId("audienceLocale")}>{error("audienceLocale")}</small> : null}
              </label>
              <label className="studio-field">
                <span>{labels.audienceStatus}</span>
                <select disabled value="active"><option value="active">{labels.activeOnly}</option></select>
                <input name="audienceStatus" type="hidden" value="active" />
              </label>
            </section>

            <section className="studio-panel" aria-labelledby="campaign-schedule-title">
              <div className="studio-panel__heading">
                <span>04</span>
                <h2 id="campaign-schedule-title">{labels.schedule}</h2>
              </div>
              <label className="studio-field">
                <span>{labels.scheduledFor}</span>
                <input
                  aria-describedby={error("scheduledFor") ? errorId("scheduledFor") : undefined}
                  aria-invalid={Boolean(error("scheduledFor")) || undefined}
                  defaultValue={toUtcDateTimeInput(campaign?.scheduledFor ?? null)}
                  name="scheduledFor"
                  type="datetime-local"
                />
                {error("scheduledFor") ? <small className="studio-field__error" id={errorId("scheduledFor")}>{error("scheduledFor")}</small> : null}
              </label>
            </section>
          </aside>
        </div>
      ) : (
        <section className="studio-panel">
          <p>{labels.unavailable}</p>
        </section>
      )}

      <div className="studio-editor__actions">
        {editable ? (
          <>
            <CampaignButton className="studio-button studio-button--secondary" icon={Save} intent="save" label={labels.save} pendingLabel={labels.saving} />
            <CampaignButton className="studio-button studio-button--secondary" confirmMessage={labels.scheduleConfirm} icon={CalendarClock} intent="schedule" label={labels.scheduleAction} pendingLabel={labels.working} />
            <CampaignButton className="studio-button studio-button--primary" confirmMessage={labels.sendConfirm} icon={Send} intent="send" label={labels.send} pendingLabel={labels.working} />
          </>
        ) : null}
        {campaign && (
          campaign.status === "draft"
          || campaign.status === "scheduled"
          || campaign.status === "sending"
        ) ? (
          <CampaignButton
            className="studio-button studio-button--danger"
            confirmMessage={labels.cancelConfirm}
            icon={XCircle}
            intent="cancel"
            label={labels.cancel}
            pendingLabel={labels.working}
          />
        ) : null}
      </div>
    </form>
  );
}
