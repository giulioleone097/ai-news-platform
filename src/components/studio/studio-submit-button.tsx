"use client";

import type { MouseEventHandler } from "react";
import { useFormStatus } from "react-dom";

export function StudioSubmitButton({
  idleLabel,
  pendingLabel,
  className = "studio-button studio-button--primary",
  formAction,
  onClick,
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={pending}
      formAction={formAction}
      onClick={onClick}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
