"use client";

import { useId, useRef, useState } from "react";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";
import { ConfirmDialog, splitQuestion } from "@/components/studio/confirm-dialog";
import type { Locale } from "@/i18n";
import { bulkCopy } from "./copy";
import styles from "./bulk.module.css";
import { exceedsBatchLimit } from "./selection";
import type { BulkAction } from "./types";

const actions: BulkAction[] = ["publish", "unpublish", "delete"];

const buttonClass: Record<BulkAction, string> = {
  publish: "button button--small button--primary",
  unpublish: "button button--small button--quiet",
  delete: "button button--small button--danger",
};

export function BulkActionBar({
  locale,
  count,
  disabled,
  onRun,
}: {
  locale: Locale;
  count: number;
  disabled: boolean;
  onRun: (action: BulkAction) => void;
}) {
  const copy = bulkCopy[locale];
  const limitId = useId();
  const overLimit = exceedsBatchLimit(count, batchLimit);
  const [asking, setAsking] = useState<BulkAction | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <div className={styles.bar}>
      <p className={styles.count}>{copy.selectedCount(count)}</p>
      <div className={styles.actions} role="group" aria-label={copy.actionsLabel}>
        {actions.map((action) => (
          <button
            key={action}
            aria-describedby={overLimit ? limitId : undefined}
            className={buttonClass[action]}
            disabled={disabled || overLimit}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setAsking(action);
            }}
            type="button"
          >
            {copy.labels[action]}
          </button>
        ))}
        {overLimit ? (
          <p className={styles.limit} id={limitId}>
            {copy.overLimit(batchLimit)}
          </p>
        ) : null}
      </div>
      {asking ? (
        <ConfirmDialog
          {...splitQuestion(copy.confirm[asking](count))}
          confirmLabel={copy.labels[asking]}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null);
            onRun(asking);
          }}
          open
          tone={asking === "delete" ? "danger" : "primary"}
          triggerRef={trigger}
        />
      ) : null}
    </div>
  );
}
