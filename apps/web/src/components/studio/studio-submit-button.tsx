"use client";

import type { MouseEventHandler } from "react";
import { useFormStatus } from "react-dom";

export function StudioSubmitButton({
  idleLabel,
  pendingLabel,
  className = "studio-button studio-button--primary",
  ariaLabel,
  formAction,
  onClick,
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  /** Names the item the button acts on, for rows whose buttons would otherwise all read the same. */
  ariaLabel?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-label={ariaLabel}
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
