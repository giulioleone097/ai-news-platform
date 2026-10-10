"use client";

import { useActionState } from "react";
import type { Locale } from "@/i18n";
import { deleteCategoryAction } from "@/app/[locale]/(studio)/studio/categories/actions";
import { categoryCopy } from "@/app/[locale]/(studio)/studio/categories/copy";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import { idleCategoryActionState } from "./category-form-state";
import styles from "./categories.module.css";

export function DeleteCategoryButton({
  locale,
  name,
  translationKey,
}: {
  locale: Locale;
  name: string;
  translationKey: string;
}) {
  const [state, formAction] = useActionState(deleteCategoryAction, idleCategoryActionState);
  const copy = categoryCopy[locale];

  return (
    <form action={formAction} className={styles.deleteForm}>
      <input name="locale" type="hidden" value={locale} />
      <input name="translationKey" type="hidden" value={translationKey} />
      <StudioSubmitButton
        ariaLabel={`${copy.delete}: ${name}`}
        className="studio-button studio-button--danger"
        idleLabel={copy.delete}
        onClick={(event) => {
          if (!window.confirm(copy.deleteConfirmation(name))) event.preventDefault();
        }}
        pendingLabel={copy.deleting}
      />
      {state.status === "error" && state.message ? (
        <p className="studio-alert studio-alert--error" role="alert">{state.message}</p>
      ) : null}
    </form>
  );
}
