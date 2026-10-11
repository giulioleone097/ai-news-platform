import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "info" | "danger";

/** A small status badge: the word on a tint of its tone. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="studio-badge" data-tone={tone}>
      {children}
    </span>
  );
}

/** Machine statuses such as "approved" read as words: first letter up, the rest as it is. */
export function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
