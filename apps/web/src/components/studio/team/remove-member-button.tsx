"use client";

import { useActionState } from "react";
import type { Locale } from "@/i18n";
import { removeMemberAction } from "@/app/[locale]/(studio)/studio/team/actions";
import { teamCopy } from "@/app/[locale]/(studio)/studio/team/copy";
import { idleStudioActionState } from "@/components/studio/action-state";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import styles from "./team.module.css";

export function RemoveMemberButton({ id, email, locale }: { id: string; email: string; locale: Locale }) {
  const [state, formAction] = useActionState(removeMemberAction, idleStudioActionState);
  const copy = teamCopy[locale];

  return (
    <form action={formAction} className={styles.inlineForm}>
      <input name="locale" type="hidden" value={locale} />
      <input name="id" type="hidden" value={id} />
      <StudioSubmitButton
        ariaLabel={`${copy.remove}: ${email}`}
        className="studio-button studio-button--danger"
        idleLabel={copy.remove}
        onClick={(event) => {
          if (!window.confirm(copy.removeConfirmation(email))) event.preventDefault();
        }}
        pendingLabel={copy.removing}
      />
      {state.status === "error" && state.message ? (
        <p className="studio-alert studio-alert--error" role="alert">{state.message}</p>
      ) : null}
    </form>
  );
}
