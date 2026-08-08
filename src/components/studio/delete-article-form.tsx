"use client";

import type { Locale, Messages } from "@/i18n";
import { deleteArticleAction } from "@/app/[locale]/(studio)/studio/actions";
import { studioSupplementalCopy } from "./studio-copy";
import { StudioSubmitButton } from "./studio-submit-button";

export function DeleteArticleForm({
  articleId,
  locale,
  messages,
}: {
  articleId: string;
  locale: Locale;
  messages: Messages;
}) {
  return (
    <form
      action={deleteArticleAction}
      onSubmit={(event) => {
        if (!window.confirm(messages.studio.deleteConfirmation)) event.preventDefault();
      }}
    >
      <input name="id" type="hidden" value={articleId} />
      <input name="locale" type="hidden" value={locale} />
      <StudioSubmitButton
        className="studio-button studio-button--danger"
        idleLabel={messages.studio.deleteArticle}
        pendingLabel={studioSupplementalCopy[locale].deletePending}
      />
    </form>
  );
}
