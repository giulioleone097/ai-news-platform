"use client";

import { useParams } from "next/navigation";
import { type MouseEvent, type RefObject, useEffect, useId, useRef, useState } from "react";
import { isLocale } from "@atlasnews/core/locale";
import "./confirm-dialog.css";

const copy = {
  en: { cancel: "Cancel", irreversible: "This cannot be undone." },
  it: { cancel: "Annulla", irreversible: "L’operazione non si può annullare." },
} as const;

/** What a button asks before it acts: the question names the item; the second line says what follows. */
export interface ConfirmCopy {
  title: string;
  /** Defaults to "This cannot be undone." for a danger action and to nothing for the others. */
  consequence?: string;
  /** Defaults to the button's own label. */
  confirmLabel?: string;
  tone?: "danger" | "primary";
}

/** Existing messages join question and consequence ("Remove x? They lose access."): the dialog shows them on two lines. */
export function splitQuestion(message: string): Pick<ConfirmCopy, "title" | "consequence"> {
  const at = message.indexOf("? ");
  return at < 0 ? { title: message } : { title: message.slice(0, at + 1), consequence: message.slice(at + 2) };
}

/**
 * A modal confirmation on the native `<dialog>`: the page behind is inert, Escape cancels, and focus
 * lands on Cancel, then returns to the trigger. Matches the agent-approval dialog.
 */
export function ConfirmDialog({
  confirmLabel,
  consequence,
  onCancel,
  onConfirm,
  open,
  title,
  tone = "danger",
  triggerRef,
}: ConfirmCopy & {
  confirmLabel: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** The element focus returns to; some browsers do not focus a button on click. */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const params = useParams<{ locale?: string }>();
  const text = copy[isLocale(params.locale) ? params.locale : "en"];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  const line = consequence ?? (tone === "danger" ? text.irreversible : undefined);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = triggerRef?.current ?? (document.activeElement as HTMLElement | null);
      dialog.returnValue = "";
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, triggerRef]);

  return (
    <dialog
      aria-describedby={line ? `${id}-line` : undefined}
      aria-labelledby={`${id}-title`}
      className="confirm-dialog"
      onClose={(event) => {
        opener.current?.focus();
        if (event.currentTarget.returnValue !== "confirm") onCancel();
      }}
      ref={dialogRef}
    >
      <h2 className="confirm-dialog__title" id={`${id}-title`}>{title}</h2>
      {line ? <p className="confirm-dialog__line" id={`${id}-line`}>{line}</p> : null}
      <div className="confirm-dialog__actions">
        <button className="button button--quiet" onClick={() => dialogRef.current?.close("cancel")} ref={cancelRef} type="button">
          {text.cancel}
        </button>
        <button
          className={`button ${tone === "danger" ? "button--danger" : "button--primary"}`}
          onClick={() => {
            dialogRef.current?.close("confirm");
            onConfirm();
          }}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/**
 * Puts a confirmation in front of a submit button. The click is held, the dialog asks, and Confirm
 * submits the form with this button as the submitter, so its `formAction`, name and value still apply.
 * Give the button `ref` and `onClick`, and render `dialog` next to it.
 */
export function useConfirmedSubmit(
  ref: RefObject<HTMLButtonElement | null>,
  confirm: ConfirmCopy | undefined,
  fallbackLabel: string,
  beforeSubmit?: () => void,
) {
  const [asking, setAsking] = useState(false);

  return {
    onClick(event: MouseEvent<HTMLButtonElement>) {
      if (!confirm) return;
      event.preventDefault();
      setAsking(true);
    },
    dialog: confirm ? (
      <ConfirmDialog
        {...confirm}
        confirmLabel={confirm.confirmLabel ?? fallbackLabel}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          beforeSubmit?.();
          const button = ref.current;
          button?.form?.requestSubmit(button);
        }}
        open={asking}
        triggerRef={ref}
      />
    ) : null,
  };
}
