import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n";
import { verifyCommentNotificationsAction } from "../actions";
import styles from "../notification.module.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const copy = {
  en: {
    title: "Confirm comment notifications",
    body: "Confirm that you want private email updates about this conversation. Nothing changes until you press confirm.",
    success: "Notifications are confirmed. You can return to NEURA.",
    invalid: "This confirmation link is invalid or has expired.",
    confirm: "Confirm notifications",
    home: "Return to NEURA",
  },
  it: {
    title: "Conferma le notifiche dei commenti",
    body: "Conferma di voler ricevere aggiornamenti email privati su questa conversazione. Nulla cambia finché non premi conferma.",
    success: "Notifiche confermate. Puoi tornare su NEURA.",
    invalid: "Questo link di conferma non è valido o è scaduto.",
    confirm: "Conferma notifiche",
    home: "Torna su NEURA",
  },
} as const;

export default async function VerifyCommentNotificationsPage({
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
        <span className={styles.icon} aria-hidden="true"><ShieldCheck size={22} /></span>
        <h1>{labels.title}</h1>
        <p role={status === "invalid" ? "alert" : undefined}>
          {status === "success" ? labels.success : status === "invalid" ? labels.invalid : labels.body}
        </p>
        <div className={styles.actions}>
          {!status && token ? (
            <form action={verifyCommentNotificationsAction}>
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
