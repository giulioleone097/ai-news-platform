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
    <form className="auth-actions" action={action}>
      <input name="authorizationId" type="hidden" value={authorizationId} />
      {state.status === "error" && state.message ? (
        <p className="auth-note auth-note--error" role="alert">
          {state.message}
        </p>
      ) : null}
      {canApprove ? (
        <button className="button button--primary" disabled={pending} name="decision" type="submit" value="approve">
          {pending ? labels.approving : labels.approve}
        </button>
      ) : null}
      <button className="button button--quiet" disabled={pending} name="decision" type="submit" value="deny">
        {pending ? labels.denying : labels.deny}
      </button>
    </form>
  );
}
