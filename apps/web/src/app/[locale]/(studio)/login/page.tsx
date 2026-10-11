import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/studio/login-form";
import { getContentMode, isStudioAvailable } from "@atlasnews/adapters/config/env";
import { getMessages, isLocale } from "@/i18n";
import { getEditorIdentity } from "@/lib/editor-auth";
import { chatGPTSignInPath, chatGPTSignOutPath, getSitesUser } from "@/lib/sites/editor-auth";

// Identity comes from per-request headers on Sites.
export const dynamic = "force-dynamic";

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
  const sitesUser = studioAvailable && getContentMode() === "sites" ? await getSitesUser() : null;

  const callbackError = query.error
    ? query.error === "forbidden"
      ? messages.errors.forbiddenDescription
      : locale === "it"
        ? "Il collegamento di accesso non è valido o è scaduto."
        : "The sign-in link is invalid or has expired."
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
        ) : getContentMode() === "sites" ? (
          <div className="auth-form">
            {sitesUser ? (
              <p className="auth-form__error" role="alert">
                {messages.auth.notAnEditor.replace("{email}", sitesUser.email)}
              </p>
            ) : (
              <p>{messages.auth.chatgptDescription}</p>
            )}
            {/* The platform owns sign-in: a plain top-level link, never a client-side navigation. */}
            <a
              className="auth-submit"
              href={sitesUser ? chatGPTSignOutPath(`/${locale}/login`) : chatGPTSignInPath(`/${locale}/studio`)}
              target="_top"
            >
              {sitesUser ? messages.auth.switchAccount : messages.auth.signInWithChatGPT}
              <ArrowRight aria-hidden="true" size={18} />
            </a>
          </div>
        ) : (
          <LoginForm copy={messages.auth} locale={locale} />
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
