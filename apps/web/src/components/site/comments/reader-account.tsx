import { useEffect, useState } from "react";
import { signInPath, signOutPath } from "@/lib/auth/paths";
import type { Copy } from "./comment-copy";
import styles from "./comments.module.css";

type ReaderProvider = "chatgpt" | "google" | "github";
export type ReaderSession = {
  /** Null for a guest. `provider` is how they signed in. */
  user: { displayName: string; provider: string } | null;
  /** The ways to sign in on this deployment. */
  providers: ReaderProvider[];
};

const readerProviderLabels: Record<ReaderProvider, string> = { chatgpt: "ChatGPT", google: "Google", github: "GitHub" };

function isReaderProvider(value: unknown): value is ReaderProvider {
  return typeof value === "string" && value in readerProviderLabels;
}

function parseReaderSession(value: unknown): ReaderSession | null {
  if (!value || typeof value !== "object") return null;
  const { user, providers } = value as { user?: unknown; providers?: unknown };
  if (!Array.isArray(providers)) return null;
  const known = providers.filter(isReaderProvider);
  if (user === null) return { user: null, providers: known };
  if (!user || typeof user !== "object") return null;
  const { displayName, provider } = user as { displayName?: unknown; provider?: unknown };
  if (typeof displayName !== "string" || typeof provider !== "string") return null;
  return { user: { displayName, provider }, providers: known };
}

/** Who is signed in and how to sign in here; null until known, and when the question fails (guest only). */
export function useReaderSession() {
  const [session, setSession] = useState<ReaderSession | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => setSession(parseReaderSession(value)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return session;
}

/** Sign-in links next to guest commenting, or who is commenting and how to sign out. */
export function ReaderAccount({ session, text }: { session: ReaderSession; text: Copy }) {
  const returnTo = `${window.location.pathname}${window.location.search}#comments`;
  if (session.user) {
    const provider = isReaderProvider(session.user.provider) ? session.user.provider : "google";
    return (
      <div className={styles.account}>
        <p>{text.signedInAs} <strong>{session.user.displayName}</strong></p>
        {/* ChatGPT sign-out belongs to the platform and must leave the page; ours is a POST to /api/auth/signout. */}
        <form action={signOutPath(provider, returnTo)} method="post" target={provider === "chatgpt" ? "_top" : undefined}>
          <button className="button button--ghost button--small" type="submit">{text.signOut}</button>
        </form>
      </div>
    );
  }
  if (!session.providers.length) return null;
  return (
    <div className={styles.account}>
      <p>{text.signInPrompt}</p>
      <div className={styles.accountLinks}>
        {session.providers.map((provider) => (
          <a
            className="button button--quiet button--small"
            href={signInPath(provider, returnTo)}
            key={provider}
            target={provider === "chatgpt" ? "_top" : undefined}
          >
            {text.signInWith} {readerProviderLabels[provider]}
          </a>
        ))}
      </div>
    </div>
  );
}
