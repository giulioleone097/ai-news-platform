"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import type { Locale } from "@/i18n";
import { deleteCategoryAction } from "@/app/[locale]/(studio)/studio/categories/actions";
import { categoryCopy } from "@/app/[locale]/(studio)/studio/categories/copy";
import { Note } from "@/components/studio/note";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";
import { idleCategoryActionState } from "./category-form-state";

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
    <form action={formAction}>
      <input name="locale" type="hidden" value={locale} />
      <input name="translationKey" type="hidden" value={translationKey} />
      <StudioSubmitButton
        ariaLabel={`${copy.delete}: ${name}`}
        className="studio-icon-button studio-icon-button--danger"
        icon={<Trash2 aria-hidden="true" />}
        idleLabel={copy.delete}
        onClick={(event) => {
          if (!window.confirm(copy.deleteConfirmation(name))) event.preventDefault();
        }}
        pendingLabel={copy.deleting}
      />
      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}
    </form>
  );
}
