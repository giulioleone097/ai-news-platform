"use client";

import { useActionState } from "react";
import type { Locale, Messages } from "@/i18n";
import { idleStudioActionState } from "./action-state";
import { StudioSubmitButton } from "./studio-submit-button";
import { signInAction } from "@/app/[locale]/(studio)/login/actions";

export function LoginForm({
  locale,
  copy,
}: {
  locale: Locale;
  copy: Messages["auth"];
}) {
  const [state, formAction] = useActionState(signInAction, idleStudioActionState);

  return (
    <form className="auth-form" action={formAction} noValidate>
      <input name="locale" type="hidden" value={locale} />
      {state.status === "error" && state.message ? (
        <p className="auth-form__error" role="alert">
          {state.message}
        </p>
      ) : null}

      <label className="auth-field">
        <span>{copy.emailLabel}</span>
        <input
          autoComplete="email"
          inputMode="email"
          name="email"
          placeholder={copy.emailPlaceholder}
          required
          type="email"
        />
      </label>

      <label className="auth-field">
        <span>{copy.passwordLabel}</span>
        <input
          autoComplete="current-password"
          name="password"
          placeholder={copy.passwordPlaceholder}
          required
          type="password"
        />
      </label>

      <StudioSubmitButton
        className="auth-submit"
        idleLabel={copy.signIn}
        pendingLabel={copy.signingIn}
      />
    </form>
  );
}
