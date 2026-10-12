"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import type { Locale } from "@/i18n";
import { deleteEntityAction, type EntityFormState } from "@/app/[locale]/(studio)/studio/entities/actions";
import { entityCopy } from "@/app/[locale]/(studio)/studio/entities/copy";
import { Note } from "@/components/studio/note";
import { StudioSubmitButton } from "@/components/studio/studio-submit-button";

/** `compact` is the quiet icon for a table row; otherwise a labelled danger button. */
export function EntityDeleteButton({
  compact = false,
  locale,
  slug,
  name,
}: {
  compact?: boolean;
  locale: Locale;
  slug: string;
  name: string;
}) {
  const copy = entityCopy[locale];
  const [state, formAction] = useActionState<EntityFormState, FormData>(deleteEntityAction, { status: "idle" });

  return (
    <form action={formAction}>
      <input name="locale" type="hidden" value={locale} />
      <input name="slug" type="hidden" value={slug} />
      <StudioSubmitButton
        ariaLabel={`${copy.deleteTitle}: ${name}`}
        className={compact ? "studio-icon-button studio-icon-button--danger" : "button button--danger"}
        icon={compact ? <Trash2 aria-hidden="true" /> : undefined}
        idleLabel={copy.delete}
        confirm={{ title: `${copy.deleteTitle} “${name}”?` }}
        pendingLabel={copy.deleting}
      />
      {state.status === "error" && state.message ? <Note tone="error">{state.message}</Note> : null}
    </form>
  );
}
