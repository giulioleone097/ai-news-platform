"use client";

import { useActionState } from "react";
import { idleStudioActionState } from "@/components/studio/action-state";
import { decideAuthorization } from "./actions";

export function DecisionForm({
  authorizationId,
  canApprove,
  labels,
}: {
  authorizationId: string;
  canApprove: boolean;
  labels: { approve: string; approving: string; deny: string; denying: string };
}) {
  const [state, action, pending] = useActionState(decideAuthorization, idleStudioActionState);

  return (
    <form className="auth-form" action={action}>
      <input name="authorizationId" type="hidden" value={authorizationId} />
      {state.status === "error" && state.message ? (
        <p className="auth-form__error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="consent-actions">
        {canApprove ? (
          <button className="auth-submit" disabled={pending} name="decision" type="submit" value="approve">
            {pending ? labels.approving : labels.approve}
          </button>
        ) : null}
        <button className="auth-submit consent-deny" disabled={pending} name="decision" type="submit" value="deny">
          {pending ? labels.denying : labels.deny}
        </button>
      </div>
    </form>
  );
}
