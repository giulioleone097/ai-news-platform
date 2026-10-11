import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./dashboard-signals.module.css";

/** The row of "needs attention" counts on the dashboard; each `SignalCard` is one count. */
export function DashboardSignals({ children }: { children: ReactNode }) {
  return <div className={styles.signals}>{children}</div>;
}

/** `value` is null where the count is unavailable (the feature is not configured): shown as an en dash. */
export function SignalCard({
  href,
  index,
  label,
  value,
}: {
  href: string;
  index: string;
  label: string;
  value: number | null;
}) {
  return (
    <article className={styles.card}>
      <span aria-hidden="true" className={styles.index}>{index}</span>
      <strong className={styles.value}>{value ?? "–"}</strong>
      <p className={styles.label}>
        <Link href={href}>{label}</Link>
      </p>
    </article>
  );
}
