"use client";

import { useActionState } from "react";
import type { TeamRole } from "@atlasnews/core/team/domain/team";
import type { Locale } from "@/i18n";
import { changeRoleAction } from "@/app/[locale]/(studio)/studio/team/actions";
import { teamCopy } from "@/app/[locale]/(studio)/studio/team/copy";
import { idleStudioActionState } from "@/components/studio/action-state";
import { Note } from "@/components/studio/note";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";

export function RoleForm({ id, email, locale, role }: { id: string; email: string; locale: Locale; role: TeamRole }) {
  const [state, formAction] = useActionState(changeRoleAction, idleStudioActionState);
  const copy = teamCopy[locale];
  const selectId = `role-${id}`;

  return (
    <form action={formAction} className="studio-stack">
      <input name="locale" type="hidden" value={locale} />
      <input name="id" type="hidden" value={id} />
      <span className="studio-inline">
        <label className="sr-only" htmlFor={selectId}>{`${copy.role}: ${email}`}</label>
        <select className="studio-control" defaultValue={role} id={selectId} name="role">
          <option value="editor">{copy.roleEditor}</option>
          <option value="admin">{copy.roleAdmin}</option>
        </select>
        <StudioSubmitButton
          ariaLabel={`${copy.saveRole}: ${email}`}
          className="button button--small button--quiet"
          idleLabel={copy.saveRole}
          pendingLabel={copy.savingRole}
        />
      </span>
      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}
    </form>
  );
}
