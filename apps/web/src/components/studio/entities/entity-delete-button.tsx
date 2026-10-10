"use client";

import { useActionState } from "react";
import type { Locale } from "@/i18n";
import { deleteEntityAction, type EntityFormState } from "@/app/[locale]/(studio)/studio/entities/actions";
import { entityCopy } from "@/app/[locale]/(studio)/studio/entities/copy";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import styles from "./entities.module.css";

export function EntityDeleteButton({ locale, slug }: { locale: Locale; slug: string }) {
  const copy = entityCopy[locale];
  const [state, formAction] = useActionState<EntityFormState, FormData>(deleteEntityAction, { status: "idle" });

  return (
    <form action={formAction} className={styles.deleteForm}>
      <input name="locale" type="hidden" value={locale} />
      <input name="slug" type="hidden" value={slug} />
      <StudioSubmitButton
        className="studio-button studio-button--danger"
        idleLabel={copy.delete}
        onClick={(event) => {
          if (!window.confirm(copy.deleteConfirmation)) event.preventDefault();
        }}
        pendingLabel={copy.deleting}
      />
      {state.status === "error" && state.message ? (
        <p className={`studio-alert studio-alert--error ${styles.deleteError}`} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
