"use client";

import { RefreshCw, XCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { Locale } from "@/i18n";
import {
  cancelSocialOutboxAction,
  retrySocialOutboxAction,
} from "./social-actions";
import styles from "./distribution.module.css";

function MutationSubmit({
  confirmMessage,
  intent,
  label,
}: {
  confirmMessage: string;
  intent: "cancel" | "retry";
  label: string;
}) {
  const { pending } = useFormStatus();
  const Icon = intent === "cancel" ? XCircle : RefreshCw;
  return (
    <button
      className={styles.queueAction}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      type="submit"
    >
      <Icon aria-hidden="true" size={14} />
      {pending ? "…" : label}
    </button>
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
      <MutationSubmit confirmMessage={confirmMessage} intent={intent} label={label} />
    </form>
  );
}
