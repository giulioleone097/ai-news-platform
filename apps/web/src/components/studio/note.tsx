import type { ReactNode } from "react";

/** A calm bordered note; the left edge carries the tone. Errors and success messages announce themselves. */
export function Note({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "error";
  children: ReactNode;
}) {
  return (
    <p
      aria-atomic={tone === "error" ? true : undefined}
      className={`studio-note studio-note--${tone}`}
      role={tone === "error" ? "alert" : tone === "success" ? "status" : undefined}
    >
      {children}
    </p>
  );
}

/** A feature that is not switched on: what it is, what it does and the next step, in one neutral note. */
export function OffNote({ title, body, next }: { title: string; body: string; next: string }) {
  return (
    <Note>
      <strong className="studio-note__title">{title}</strong>
      {body} {next}
    </Note>
  );
}
