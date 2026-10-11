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
