import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/studio/login-form";
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
        <a className="auth-provider" href={signInPath(provider, `/${locale}/studio`)} key={provider}>
          {label[provider]}
          <ArrowRight aria-hidden="true" size={18} />
        </a>
      ))}
    </>
  );
}

/** Signs the person out of whatever they signed in with and comes back to this page. */
function SwitchAccount({ copy, locale, user }: { copy: Messages["auth"]; locale: string; user: SignedInUser }) {
  if (user.provider === "chatgpt") {
    return (
      <a className="auth-submit" href={signOutPath("chatgpt", `/${locale}/login`)} target="_top">
        {copy.switchAccount}
        <ArrowRight aria-hidden="true" size={18} />
      </a>
    );
  }
  return (
    <form action={signOutPath(user.provider, `/${locale}/login`)} method="post">
      <button className="auth-submit" type="submit">
        {copy.switchAccount}
        <ArrowRight aria-hidden="true" size={18} />
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
        <Link className="auth-back" href={`/${locale}`}>
          <ArrowLeft aria-hidden="true" size={16} />
          {messages.auth.backToSite}
        </Link>

        <div className="auth-brand" aria-label={messages.common.brandName}>
          {messages.common.brandName}
          <span>STUDIO</span>
        </div>

        <div className="auth-heading">
          <p className="auth-eyebrow">{messages.auth.eyebrow}</p>
          <h1 id="auth-title">{messages.auth.title}</h1>
          <p>{messages.auth.description}</p>
        </div>

        {callbackError ? (
          <p className="auth-form__error" role="alert">
            {callbackError}
          </p>
        ) : null}

        {!studioAvailable ? (
          <div className="auth-demo" role="status">
            <span className="auth-demo__icon" aria-hidden="true">
              <LockKeyhole size={20} />
            </span>
            <div>
              <strong>{messages.auth.unavailableTitle}</strong>
              <p>{messages.auth.unavailable}</p>
            </div>
          </div>
        ) : editor?.isDemo ? (
          <div className="auth-demo">
            <span className="auth-demo__icon" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <div>
              <strong>{messages.studio.demoMode}</strong>
              <p>{messages.auth.demoNotice}</p>
            </div>
            <Link className="auth-submit" href={`/${locale}/studio`}>
              {locale === "it" ? "Entra nello Studio" : "Enter Studio"}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        ) : mode === "sites" ? (
          <div className="auth-form">
            {user ? (
              <>
                <p className="auth-form__error" role="alert">
                  {messages.auth.notAnEditor.replace("{email}", user.email ?? "")}
                </p>
                <SwitchAccount copy={messages.auth} locale={locale} user={user} />
              </>
            ) : (
              <>
                <p>{messages.auth.chatgptDescription}</p>
                {/* The platform owns sign-in: a plain top-level link, never a client-side navigation. */}
                <a className="auth-submit" href={signInPath("chatgpt", `/${locale}/studio`)} target="_top">
                  {messages.auth.signInWithChatGPT}
                  <ArrowRight aria-hidden="true" size={18} />
                </a>
                <ProviderLinks copy={messages.auth} locale={locale} providers={providers} />
              </>
            )}
          </div>
        ) : (
          <>
            <LoginForm copy={messages.auth} locale={locale} />
            {providers.length ? (
              <div className="auth-form">
                <ProviderLinks copy={messages.auth} locale={locale} providers={providers} />
              </div>
            ) : null}
          </>
        )}
      </section>

      <aside className="auth-visual" aria-hidden="true">
        <div className="auth-visual__grid" />
        <p>AtlasNews / EDITORIAL INTELLIGENCE</p>
        <span>01 — 26</span>
      </aside>
    </main>
  );
}
