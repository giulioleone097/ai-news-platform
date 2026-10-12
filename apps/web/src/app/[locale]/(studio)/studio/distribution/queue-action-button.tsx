"use client";

import { RefreshCw, XCircle } from "lucide-react";
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { splitQuestion, useConfirmedSubmit } from "@/components/studio/confirm-dialog";
import type { Locale } from "@/i18n";
import {
  cancelSocialOutboxAction,
  retrySocialOutboxAction,
} from "./social-actions";

/** The row's own label for cancelling is just "Cancel", which the dialog already uses to dismiss itself. */
const cancelDispatch = { en: "Cancel post", it: "Annulla post" } as const;

function MutationSubmit({
  confirmMessage,
  intent,
  label,
  locale,
}: {
  confirmMessage: string;
  intent: "cancel" | "retry";
  label: string;
  locale: Locale;
}) {
  const { pending } = useFormStatus();
  const Icon = intent === "cancel" ? XCircle : RefreshCw;
  const ref = useRef<HTMLButtonElement>(null);
  const confirmation = useConfirmedSubmit(
    ref,
    {
      ...splitQuestion(confirmMessage),
      confirmLabel: intent === "cancel" ? cancelDispatch[locale] : label,
      tone: intent === "cancel" ? "danger" : "primary",
    },
    label,
  );
  return (
    <>
      <button
        className="button button--small button--quiet"
        disabled={pending}
        onClick={confirmation.onClick}
        ref={ref}
        type="submit"
      >
        <Icon aria-hidden="true" />
        {pending ? "…" : label}
      </button>
      {confirmation.dialog}
    </>
  );
}

export function QueueActionButton({
  confirmMessage,
  id,
  intent,
  label,
  locale,
}: {
  confirmMessage: string;
  id: string;
  intent: "cancel" | "retry";
  label: string;
  locale: Locale;
}) {
  const action = intent === "cancel" ? cancelSocialOutboxAction : retrySocialOutboxAction;
  return (
    <form action={action}>
      <input name="id" type="hidden" value={id} />
      <input name="locale" type="hidden" value={locale} />
      <input name="confirm" type="hidden" value="true" />
      <MutationSubmit confirmMessage={confirmMessage} intent={intent} label={label} locale={locale} />
    </form>
  );
}
