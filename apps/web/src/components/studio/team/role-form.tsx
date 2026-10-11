"use client";

import { useActionState } from "react";
import type { TeamRole } from "@atlasnews/core/team/domain/team";
import type { Locale } from "@/i18n";
import { changeRoleAction } from "@/app/[locale]/(studio)/studio/team/actions";
import { teamCopy } from "@/app/[locale]/(studio)/studio/team/copy";
import { idleStudioActionState } from "@/components/studio/action-state";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import styles from "./team.module.css";

export function RoleForm({ id, email, locale, role }: { id: string; email: string; locale: Locale; role: TeamRole }) {
  const [state, formAction] = useActionState(changeRoleAction, idleStudioActionState);
  const copy = teamCopy[locale];
  const selectId = `role-${id}`;

  return (
    <form action={formAction} className={styles.inlineForm}>
      <input name="locale" type="hidden" value={locale} />
      <input name="id" type="hidden" value={id} />
      <span className={styles.inlineFields}>
        <label className="sr-only" htmlFor={selectId}>{`${copy.role}: ${email}`}</label>
        <select defaultValue={role} id={selectId} name="role">
          <option value="editor">{copy.roleEditor}</option>
          <option value="admin">{copy.roleAdmin}</option>
        </select>
        <StudioSubmitButton
          ariaLabel={`${copy.saveRole}: ${email}`}
          className="studio-button studio-button--secondary"
          idleLabel={copy.saveRole}
          pendingLabel={copy.savingRole}
        />
      </span>
      {state.status === "error" && state.message ? (
        <p className="studio-alert studio-alert--error" role="alert">{state.message}</p>
      ) : null}
    </form>
  );
}
