"use client";

import { useActionState } from "react";
import { idleStudioActionState } from "@/components/studio/action-state";
import { signInForConsent } from "./actions";

export function ConsentSignInForm({
  authorizationId,
  labels,
}: {
  authorizationId: string;
  labels: { email: string; password: string; signIn: string; signingIn: string };
}) {
  const [state, action, pending] = useActionState(signInForConsent, idleStudioActionState);

  return (
    <form className="auth-form" action={action} noValidate>
      <input name="authorizationId" type="hidden" value={authorizationId} />
      {state.status === "error" && state.message ? (
        <p className="auth-form__error" role="alert">
          {state.message}
        </p>
      ) : null}
      <label className="auth-field">
        <span>{labels.email}</span>
        <input autoComplete="email" inputMode="email" name="email" required type="email" />
      </label>
      <label className="auth-field">
        <span>{labels.password}</span>
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      <button className="auth-submit" disabled={pending} type="submit">
        {pending ? labels.signingIn : labels.signIn}
      </button>
    </form>
  );
}
