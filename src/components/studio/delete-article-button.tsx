"use client";

import type { Locale, Messages } from "@/i18n";
import { deleteArticleAction } from "@/app/[locale]/(studio)/studio/actions";
import { studioSupplementalCopy } from "./studio-copy";
import { StudioSubmitButton } from "./studio-submit-button";

export function DeleteArticleButton({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  return (
    <StudioSubmitButton
      className="studio-button studio-button--danger"
      formAction={deleteArticleAction}
      idleLabel={messages.studio.deleteArticle}
      onClick={(event) => {
        if (!window.confirm(messages.studio.deleteConfirmation)) event.preventDefault();
      }}
      pendingLabel={studioSupplementalCopy[locale].deletePending}
    />
  );
}
