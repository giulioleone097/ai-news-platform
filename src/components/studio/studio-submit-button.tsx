"use client";

import { useFormStatus } from "react-dom";

export function StudioSubmitButton({
  idleLabel,
  pendingLabel,
  className = "studio-button studio-button--primary",
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
