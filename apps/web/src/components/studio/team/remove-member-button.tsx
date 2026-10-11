"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import type { Locale } from "@/i18n";
import { removeMemberAction } from "@/app/[locale]/(studio)/studio/team/actions";
import { teamCopy } from "@/app/[locale]/(studio)/studio/team/copy";
import { idleStudioActionState } from "@/components/studio/action-state";
import { Note } from "@/components/studio/note";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";

export function RemoveMemberButton({ id, email, locale }: { id: string; email: string; locale: Locale }) {
  const [state, formAction] = useActionState(removeMemberAction, idleStudioActionState);
  const copy = teamCopy[locale];

  return (
    <form action={formAction}>
      <input name="locale" type="hidden" value={locale} />
      <input name="id" type="hidden" value={id} />
      <StudioSubmitButton
        ariaLabel={`${copy.remove}: ${email}`}
        className="studio-icon-button studio-icon-button--danger"
        icon={<Trash2 aria-hidden="true" />}
        idleLabel={copy.remove}
        onClick={(event) => {
          if (!window.confirm(copy.removeConfirmation(email))) event.preventDefault();
        }}
        pendingLabel={copy.removing}
      />
      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}
    </form>
  );
}
