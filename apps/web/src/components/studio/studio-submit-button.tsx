"use client";

import { type MouseEventHandler, type ReactNode, useRef } from "react";
import { useFormStatus } from "react-dom";
import { type ConfirmCopy, useConfirmedSubmit } from "./confirm-dialog";

export function StudioSubmitButton({
  idleLabel,
  pendingLabel,
  className = "button button--primary",
  ariaLabel,
  formAction,
  icon,
  onClick,
  confirm,
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
  /** Asks in a dialog before submitting. */
  confirm?: ConfirmCopy;
}) {
  const { pending } = useFormStatus();
  const label = pending ? pendingLabel : idleLabel;
  const ref = useRef<HTMLButtonElement>(null);
  const confirmation = useConfirmedSubmit(ref, confirm, idleLabel);

  return (
    <>
      <button
        aria-label={ariaLabel}
        className={className}
        disabled={pending}
        formAction={formAction}
        onClick={(event) => {
          onClick?.(event);
          confirmation.onClick(event);
        }}
        ref={ref}
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
      {confirmation.dialog}
    </>
  );
}
