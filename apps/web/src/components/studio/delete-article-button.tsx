"use client";

import type { Locale, Messages } from "@/i18n";
import { deleteArticleAction } from "@/app/[locale]/(studio)/studio/actions";
import { studioSupplementalCopy } from "./studio-copy";
import { StudioSubmitButton } from "./studio-submit-button";

/** A quiet danger text button: the dialog it opens names the article before anything is deleted. */
export function DeleteArticleButton({
  locale,
  messages,
  title,
}: {
  locale: Locale;
  messages: Messages;
  title: string;
}) {
  const copy = studioSupplementalCopy[locale];
  return (
    <StudioSubmitButton
      className="button button--quiet article-editor__delete"
      confirm={{
        title: copy.deleteTitle.replace("{title}", title),
        consequence: copy.deleteConsequence,
        confirmLabel: messages.studio.deleteArticle,
      }}
      formAction={deleteArticleAction}
      idleLabel={`${messages.studio.deleteArticle}…`}
      pendingLabel={copy.deletePending}
    />
  );
}
