"use client";

import { CalendarClock, Save, Send, XCircle } from "lucide-react";
import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { type ConfirmCopy, useConfirmedSubmit } from "@/components/studio/confirm-dialog";
import { saveNewsletterCampaignAction } from "@/app/[locale]/(studio)/studio/newsletter/campaigns/actions";
import { idleStudioActionState } from "@/components/studio/action-state";
import { MarkdownEditor, type MarkdownEditorCopy } from "@/components/studio/markdown-editor";
import { Note } from "@/components/studio/note";
import type { Locale } from "@/i18n";
import { toUtcDateTimeInput } from "@/lib/editorial-datetime";
import type { NewsletterCampaign } from "@atlasnews/core/newsletter/domain/newsletter";

const copy = {
  en: {
    subject: "Subject",
    preheader: "Preview line",
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
    contentHelp: "Write in Markdown. Raw HTML and images from other sites are left out of the email.",
    save: "Save draft",
    saving: "Saving…",
    working: "Working…",
    scheduleAction: "Schedule",
    send: "Send now",
    cancel: "Cancel campaign",
    optional: "optional",
    subjectHelp: "What readers see first in their inbox. Up to 200 characters.",
    preheaderHelp: "The line shown after the subject. Up to 300 characters.",
    fromEmailHelp: "Set by the delivery account.",
    replyToHelp: "Replies go here. Leave empty to use the sender address.",
    scheduledForHelp: "Used by Schedule. Save draft and Send now ignore it.",
    scheduleConfirm: { title: "Schedule this campaign?", consequence: "It is sent at the UTC time you chose." },
    sendConfirm: { title: "Send this campaign now?", consequence: "It goes to the confirmed subscribers right away. The content can no longer be edited." },
    cancelConfirm: { title: "Cancel this campaign?", consequence: "Every email not yet sent is cancelled. This cannot be undone." },
    unavailable: "The content is locked once a campaign is scheduled or sent.",
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
    preheader: "Riga di anteprima",
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
    contentHelp: "Scrivi in Markdown. L’HTML grezzo e le immagini da altri siti restano fuori dall’email.",
    save: "Salva bozza",
    saving: "Salvataggio…",
    working: "Elaborazione…",
    scheduleAction: "Programma",
    send: "Invia ora",
    cancel: "Annulla campagna",
    optional: "facoltativo",
    subjectHelp: "Ciò che i lettori vedono per primo nella casella. Fino a 200 caratteri.",
    preheaderHelp: "La riga di anteprima dopo l’oggetto. Fino a 300 caratteri.",
    fromEmailHelp: "Imposta dall’account di invio.",
    replyToHelp: "Le risposte arrivano qui. Se vuoto, si usa l’indirizzo del mittente.",
    scheduledForHelp: "Usata da Programma. Salva bozza e Invia ora la ignorano.",
    scheduleConfirm: { title: "Programmare questa campagna?", consequence: "Viene inviata all’orario UTC scelto." },
    sendConfirm: { title: "Inviare ora questa campagna?", consequence: "Parte subito verso gli iscritti confermati. Il contenuto non sarà più modificabile." },
    cancelConfirm: { title: "Annullare questa campagna?", consequence: "Ogni email non ancora inviata viene annullata. L’operazione non si può annullare." },
    unavailable: "Il contenuto è bloccato quando una campagna è programmata o inviata.",
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

function setConfirmation(input: HTMLInputElement | null, value: string) {
  if (input) input.value = value;
}

function CampaignButton({
  intent,
  label,
  className,
  confirm,
  pendingLabel,
  icon: Icon,
}: {
  intent: "save" | "schedule" | "send" | "cancel";
  label: string;
  className: string;
  confirm?: Pick<ConfirmCopy, "title" | "consequence">;
  pendingLabel: string;
  icon: typeof Save;
}) {
  const { pending } = useFormStatus();
  const confirmationRef = useRef<HTMLInputElement | null>(null);
  // The server acts on `confirmation` only when it names the intent: the dialog's Confirm sets it.
  const ref = useRef<HTMLButtonElement>(null);
  const confirmation = useConfirmedSubmit(
    ref,
    confirm && { ...confirm, tone: intent === "cancel" ? "danger" : "primary" },
    label,
    () => setConfirmation(confirmationRef.current, intent),
  );
  return (
    <>
      <button
        className={className}
        disabled={pending}
        name="intent"
        onClick={(event) => {
          confirmationRef.current = (event.currentTarget.form?.elements.namedItem("confirmation") as HTMLInputElement | null) ?? null;
          setConfirmation(confirmationRef.current, "");
          confirmation.onClick(event);
        }}
        ref={ref}
        type="submit"
        value={intent}
      >
        <Icon aria-hidden="true" />
        {pending ? pendingLabel : label}
      </button>
      {confirmation.dialog}
    </>
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
  const fieldError = (field: string) =>
    error(field) ? <small className="studio-field__error" id={errorId(field)}>{error(field)}</small> : null;
  const invalid = (field: string) => ({
    "aria-describedby": error(field) ? errorId(field) : undefined,
    "aria-invalid": Boolean(error(field)) || undefined,
  });
  const canCancel = campaign
    && (campaign.status === "draft" || campaign.status === "scheduled" || campaign.status === "sending");

  const actions = (
    <div className="studio-buttons studio-buttons--flow">
      {editable ? (
        <>
          <CampaignButton className="button button--quiet" icon={Save} intent="save" label={labels.save} pendingLabel={labels.saving} />
          <CampaignButton className="button button--quiet" confirm={labels.scheduleConfirm} icon={CalendarClock} intent="schedule" label={labels.scheduleAction} pendingLabel={labels.working} />
          <CampaignButton className="button button--primary" confirm={labels.sendConfirm} icon={Send} intent="send" label={labels.send} pendingLabel={labels.working} />
        </>
      ) : null}
      {canCancel ? (
        <CampaignButton
          className="button button--danger"
          confirm={labels.cancelConfirm}
          icon={XCircle}
          intent="cancel"
          label={labels.cancel}
          pendingLabel={labels.working}
        />
      ) : null}
    </div>
  );

  return (
    <form action={action} className="studio-editor">
      <input name="locale" type="hidden" value={locale} />
      <input name="confirmation" type="hidden" value="" />
      {campaign ? <input name="id" type="hidden" value={campaign.id} /> : null}

      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}

      {editable ? (
        <div className="studio-editor__grid">
          <div className="studio-editor__main">
            <section className="studio-section">
              <label className="studio-field studio-field--title">
                <span>{labels.subject}</span>
                <input {...invalid("subject")} defaultValue={campaign?.subject} maxLength={200} name="subject" required />
                <small className="studio-field__hint">{labels.subjectHelp}</small>
                {fieldError("subject")}
              </label>
              <label className="studio-field">
                <span>{labels.preheader} <span className="studio-field__optional">({labels.optional})</span></span>
                <textarea {...invalid("preheader")} defaultValue={campaign?.preheader} maxLength={300} name="preheader" rows={2} />
                <small className="studio-field__hint">{labels.preheaderHelp}</small>
                {fieldError("preheader")}
              </label>
              <MarkdownEditor
                copy={labels.markdown}
                defaultValue={campaign?.contentMarkdown}
                error={fieldError("contentMarkdown") ?? undefined}
                errorId={errorId("contentMarkdown")}
                help={labels.contentHelp}
                invalid={Boolean(error("contentMarkdown"))}
                label={labels.content}
              />
            </section>
          </div>

          <aside className="studio-editor__aside">
            {actions}

            <fieldset className="studio-section">
              <legend>{labels.sender}</legend>
              <label className="studio-field">
                <span>{labels.fromName}</span>
                <input {...invalid("fromName")} defaultValue={campaign?.fromName ?? "AtlasNews"} maxLength={120} name="fromName" required />
                {fieldError("fromName")}
              </label>
              <label className="studio-field">
                <span>{labels.fromEmail}</span>
                <input defaultValue={campaign?.fromEmail ?? defaults.fromEmail} name="fromEmail" readOnly required type="email" />
                <small className="studio-field__hint">{labels.fromEmailHelp}</small>
              </label>
              <label className="studio-field">
                <span>{labels.replyTo} <span className="studio-field__optional">({labels.optional})</span></span>
                <input {...invalid("replyTo")} defaultValue={campaign?.replyTo ?? defaults.replyTo ?? ""} name="replyTo" type="email" />
                <small className="studio-field__hint">{labels.replyToHelp}</small>
                {fieldError("replyTo")}
              </label>
            </fieldset>

            <fieldset className="studio-section">
              <legend>{labels.audience}</legend>
              <label className="studio-field">
                <span>{labels.audienceLocale}</span>
                <select {...invalid("audienceLocale")} defaultValue={campaign?.audienceLocale ?? locale} name="audienceLocale">
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                </select>
                {fieldError("audienceLocale")}
              </label>
              <label className="studio-field">
                <span>{labels.audienceStatus}</span>
                <select disabled value="active"><option value="active">{labels.activeOnly}</option></select>
                <input name="audienceStatus" type="hidden" value="active" />
              </label>
            </fieldset>

            <fieldset className="studio-section">
              <legend>{labels.schedule}</legend>
              <label className="studio-field">
                <span>{labels.scheduledFor} <span className="studio-field__optional">({labels.optional})</span></span>
                <input
                  {...invalid("scheduledFor")}
                  defaultValue={toUtcDateTimeInput(campaign?.scheduledFor ?? null)}
                  name="scheduledFor"
                  type="datetime-local"
                />
                <small className="studio-field__hint">{labels.scheduledForHelp}</small>
                {fieldError("scheduledFor")}
              </label>
            </fieldset>
          </aside>
        </div>
      ) : (
        <>
          <Note>{labels.unavailable}</Note>
          {canCancel ? actions : null}
        </>
      )}
    </form>
  );
}
