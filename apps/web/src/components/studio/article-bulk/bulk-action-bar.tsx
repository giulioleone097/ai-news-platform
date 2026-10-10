"use client";

import { useId } from "react";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";
import type { Locale } from "@/i18n";
import { bulkCopy } from "./copy";
import styles from "./bulk.module.css";
import { exceedsBatchLimit } from "./selection";
import type { BulkAction } from "./types";

const actions: BulkAction[] = ["publish", "unpublish", "delete"];

const buttonClass: Record<BulkAction, string> = {
  publish: "studio-button studio-button--primary",
  unpublish: "studio-button studio-button--secondary",
  delete: "studio-button studio-button--danger",
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
            onClick={() => {
              if (window.confirm(copy.confirm[action](count))) onRun(action);
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
    </div>
  );
}
