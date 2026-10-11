"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteContactMessageAction } from "@/app/[locale]/(studio)/studio/inbox/actions";
import { inboxCopy } from "@/app/[locale]/(studio)/studio/inbox/copy";
import { idleStudioActionState, type StudioActionState } from "@/components/studio/action-state";
import { Note } from "@/components/studio/note";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import type { Locale } from "@/i18n";

export function MessageDeleteButton({
  locale,
  id,
  subject,
  filter,
}: {
  locale: Locale;
  id: string;
  subject: string;
  filter?: string;
}) {
  const copy = inboxCopy[locale];
  const [state, formAction] = useActionState<StudioActionState, FormData>(deleteContactMessageAction, idleStudioActionState);

  return (
    <form action={formAction}>
      <input name="locale" type="hidden" value={locale} />
      <input name="id" type="hidden" value={id} />
      {filter ? <input name="filter" type="hidden" value={filter} /> : null}
      <StudioSubmitButton
        ariaLabel={`${copy.deleteTitle}: ${subject}`}
        className="studio-icon-button studio-icon-button--danger"
        icon={<Trash2 aria-hidden="true" />}
        idleLabel={copy.delete}
        onClick={(event) => {
          if (!window.confirm(copy.deleteConfirmation)) event.preventDefault();
        }}
        pendingLabel={copy.deleting}
      />
      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}
    </form>
  );
}
