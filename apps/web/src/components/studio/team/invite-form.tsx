"use client";

import { useActionState } from "react";
import { teamLimits } from "@atlasnews/core/team/domain/team";
import type { Locale } from "@/i18n";
import { inviteMemberAction } from "@/app/[locale]/(studio)/studio/team/actions";
import { teamCopy } from "@/app/[locale]/(studio)/studio/team/copy";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import { idleInviteFormState } from "./team-state";
import styles from "./team.module.css";

export function InviteForm({ locale }: { locale: Locale }) {
  const [state, formAction] = useActionState(inviteMemberAction, idleInviteFormState);
  const copy = teamCopy[locale];
  const values = state.values ?? { email: "", name: "", role: "editor" as const };

  return (
    <form action={formAction} className="studio-panel" noValidate>
      <input name="locale" type="hidden" value={locale} />
      {state.status === "error" && state.message ? (
        <p className="studio-alert studio-alert--error" role="alert">{state.message}</p>
      ) : null}
      <div className={styles.invite}>
        <label className="studio-field">
          <span>{copy.email}</span>
          <input
            autoComplete="off"
            defaultValue={values.email}
            inputMode="email"
            maxLength={teamLimits.email.max}
            name="email"
            required
            type="email"
          />
          <small>{copy.emailHelp}</small>
        </label>
        <label className="studio-field">
          <span>{copy.name}</span>
          <input autoComplete="off" defaultValue={values.name} maxLength={teamLimits.name.max} name="name" />
          <small>{copy.nameHelp}</small>
        </label>
        <label className="studio-field">
          <span>{copy.role}</span>
          <select defaultValue={values.role} name="role">
            <option value="editor">{copy.roleEditor}</option>
            <option value="admin">{copy.roleAdmin}</option>
          </select>
        </label>
        <div className={styles.submit}>
          <StudioSubmitButton idleLabel={copy.invite} pendingLabel={copy.inviting} />
        </div>
      </div>
    </form>
  );
}
