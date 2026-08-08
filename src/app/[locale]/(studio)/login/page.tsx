import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/studio/login-form";
import { getMessages, isLocale } from "@/i18n";
import { getEditorIdentity } from "@/lib/editor-auth";

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
  const editor = await getEditorIdentity();
  if (editor && !editor.isDemo) redirect(`/${locale}/studio`);

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

        {editor?.isDemo ? (
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
        ) : (
          <LoginForm copy={messages.auth} locale={locale} />
        )}
      </section>

      <aside className="auth-visual" aria-hidden="true">
        <div className="auth-visual__grid" />
        <p>NEURA / EDITORIAL INTELLIGENCE</p>
        <span>01 — 26</span>
      </aside>
    </main>
  );
}
