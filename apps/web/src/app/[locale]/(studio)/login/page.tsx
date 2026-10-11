import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import "@/components/studio/auth.css";
import { LoginForm } from "@/components/studio/login-form";
import { StudioBrand } from "@/components/studio/studio-brand";
import type { OAuthProviderId } from "@atlasnews/adapters/auth/oauth";
import { getContentMode, getSignInProviders, isStudioAvailable } from "@atlasnews/adapters/config/env";
import { getMessages, isLocale, type Messages } from "@/i18n";
import { signInPath, signOutPath } from "@/lib/auth/paths";
import type { SignedInUser } from "@/lib/auth/signed-in-user";
import { getEditorIdentity, getSignedInUser } from "@/lib/editor-auth";

// Identity comes from per-request headers on Sites and from cookies elsewhere.
export const dynamic = "force-dynamic";

/** A provider that redirects: a plain link, because sign-in starts as a top-level navigation. */
function ProviderLinks({ copy, locale, providers }: { copy: Messages["auth"]; locale: string; providers: OAuthProviderId[] }) {
  if (!providers.length) return null;
  const label = { google: copy.signInWithGoogle, github: copy.signInWithGitHub } as const;
  return (
    <>
      <p className="auth-divider">{copy.orSignInWith}</p>
      {providers.map((provider) => (
        <a className="button button--quiet" href={signInPath(provider, `/${locale}/studio`)} key={provider}>
          {label[provider]}
        </a>
      ))}
    </>
  );
}

/** Signs the person out of whatever they signed in with and comes back to this page. */
function SwitchAccount({ copy, locale, user }: { copy: Messages["auth"]; locale: string; user: SignedInUser }) {
  if (user.provider === "chatgpt") {
    return (
      <a className="button button--primary" href={signOutPath("chatgpt", `/${locale}/login`)} target="_top">
        {copy.switchAccount}
      </a>
    );
  }
  return (
    <form action={signOutPath(user.provider, `/${locale}/login`)} method="post">
      <button className="button button--primary" type="submit">
        {copy.switchAccount}
      </button>
    </form>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getMessages(locale).auth.metadataTitle, robots: { index: false } };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const studioAvailable = isStudioAvailable();
  const editor = studioAvailable ? await getEditorIdentity() : null;
  if (editor && !editor.isDemo) redirect(`/${locale}/studio`);
  const mode = getContentMode();
  const user = studioAvailable && mode === "sites" ? await getSignedInUser() : null;
  const providers = getSignInProviders();

  const errorMessages: Record<string, string> = {
    forbidden: messages.errors.forbiddenDescription,
    oauth_failed: messages.auth.oauthFailed,
    oauth_denied: messages.auth.oauthDenied,
    oauth_email: messages.auth.oauthEmail,
  };
  const callbackError = query.error
    ? errorMessages[query.error]
      ?? (locale === "it"
        ? "Il collegamento di accesso non è valido o è scaduto."
        : "The sign-in link is invalid or has expired.")
    : null;

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <StudioBrand href={`/${locale}`} label="Studio" name={messages.common.brandName} />

        <div className="auth-head">
          <h1 id="auth-title">{messages.auth.title}</h1>
          <p>{messages.auth.description}</p>
        </div>

        {callbackError ? (
          <p className="auth-note auth-note--error" role="alert">
            {callbackError}
          </p>
        ) : null}

        {!studioAvailable ? (
          <p className="auth-note auth-note--warning" role="status">
            <strong>{messages.auth.unavailableTitle}</strong>
            {messages.auth.unavailable}
          </p>
        ) : editor?.isDemo ? (
          <div className="auth-stack">
            <p className="auth-note auth-note--warning">
              <strong>{messages.studio.demoMode}</strong>
              {messages.auth.demoNotice}
            </p>
            <Link className="button button--primary" href={`/${locale}/studio`}>
              {locale === "it" ? "Entra nello Studio" : "Enter Studio"}
            </Link>
          </div>
        ) : mode === "sites" ? (
          <div className="auth-stack">
            {user ? (
              <>
                <p className="auth-note auth-note--error" role="alert">
                  {messages.auth.notAnEditor.replace("{email}", user.email ?? "")}
                </p>
                <SwitchAccount copy={messages.auth} locale={locale} user={user} />
              </>
            ) : (
              <>
                <p className="auth-muted">{messages.auth.chatgptDescription}</p>
                {/* The platform owns sign-in: a plain top-level link, never a client-side navigation. */}
                <a className="button button--primary" href={signInPath("chatgpt", `/${locale}/studio`)} target="_top">
                  {messages.auth.signInWithChatGPT}
                </a>
                <ProviderLinks copy={messages.auth} locale={locale} providers={providers} />
              </>
            )}
          </div>
        ) : (
          <>
            <LoginForm copy={messages.auth} locale={locale} />
            {providers.length ? (
              <div className="auth-stack">
                <ProviderLinks copy={messages.auth} locale={locale} providers={providers} />
              </div>
            ) : null}
          </>
        )}

        <Link className="auth-back" href={`/${locale}`}>
          <ArrowLeft aria-hidden="true" size={16} />
          {messages.auth.backToSite}
        </Link>
      </section>
    </main>
  );
}
