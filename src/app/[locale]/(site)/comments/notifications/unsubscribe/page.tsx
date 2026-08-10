import type { Metadata } from "next";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n";
import { unsubscribeCommentNotificationsAction } from "../actions";
import styles from "../notification.module.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const copy = {
  en: {
    title: "Stop comment notifications",
    body: "This disables all future email updates for this conversation. The link itself does not make changes until you confirm.",
    success: "Comment notifications are now disabled.",
    invalid: "This unsubscribe link is invalid or has expired.",
    confirm: "Disable notifications",
    home: "Return to NEURA",
  },
  it: {
    title: "Disattiva le notifiche dei commenti",
    body: "Disattiva tutti i futuri aggiornamenti email per questa conversazione. Il link non apporta modifiche finché non confermi.",
    success: "Le notifiche dei commenti sono state disattivate.",
    invalid: "Questo link di disiscrizione non è valido o è scaduto.",
    confirm: "Disattiva notifiche",
    home: "Torna su NEURA",
  },
} as const;

export default async function UnsubscribeCommentNotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[]; status?: string | string[] }>;
}) {
  const [{ locale: rawLocale }, search] = await Promise.all([params, searchParams]);
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const token = Array.isArray(search.token) ? search.token[0] : search.token;
  const status = Array.isArray(search.status) ? search.status[0] : search.status;
  const labels = copy[locale];

  return (
    <main className={`site-shell ${styles.shell}`} id="main-content">
      <section className={styles.card}>
        <span className={styles.icon} aria-hidden="true"><BellOff size={22} /></span>
        <h1>{labels.title}</h1>
        <p role={status === "invalid" ? "alert" : undefined}>
          {status === "success" ? labels.success : status === "invalid" ? labels.invalid : labels.body}
        </p>
        <div className={styles.actions}>
          {!status && token ? (
            <form action={unsubscribeCommentNotificationsAction}>
              <input name="locale" type="hidden" value={locale} />
              <input name="token" type="hidden" value={token} />
              <button className={styles.primary} type="submit">{labels.confirm}</button>
            </form>
          ) : null}
          <Link className={styles.secondary} href={`/${locale}`}>{labels.home}</Link>
        </div>
      </section>
    </main>
  );
}
