"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function StudioSubmitButton({
  idleLabel,
  pendingLabel,
  className = "button button--primary",
  ariaLabel,
  formAction,
  icon,
  onClick,
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  /** Names the item the button acts on, for rows whose buttons would otherwise all read the same. */
  ariaLabel?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Shows this icon instead of the label, which stays available to assistive technology. */
  icon?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
  const { pending } = useFormStatus();
  const label = pending ? pendingLabel : idleLabel;

  return (
    <button
      aria-label={ariaLabel}
      className={className}
      disabled={pending}
      formAction={formAction}
      onClick={onClick}
      title={icon ? idleLabel : undefined}
      type="submit"
    >
      {icon ? (
        <>
          {icon}
          <span className="sr-only">{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
