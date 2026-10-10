import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { normalizeLocale } from "@/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizationIdPattern, isEditorProfile, isRedirectAllowed, redirectHost } from "./authorization";
import "./consent.css";
import { consentCopy, type ConsentCopy } from "./copy";
import { DecisionForm } from "./decision-form";
import { ConsentSignInForm } from "./sign-in-form";
import { signOutOfConsent } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = normalizeLocale((await headers()).get("accept-language"));
  return { title: `${consentCopy[locale].title} - AtlasNews`, robots: { index: false, follow: false } };
}

function Panel({ copy, children }: { copy: ConsentCopy; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="consent-title">
        <Link className="auth-back" href="/">
          <ArrowLeft aria-hidden="true" size={16} />
          {copy.backToSite}
        </Link>
        <div className="auth-heading consent-heading">
          <p className="auth-eyebrow">{copy.eyebrow}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function Problem({ copy, message }: { copy: ConsentCopy; message: string }) {
  return (
    <Panel copy={copy}>
      <h1 id="consent-title">{copy.title}</h1>
      <p className="auth-form__error" role="alert">
        {message}
      </p>
    </Panel>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>;
}) {
  const copy = consentCopy[normalizeLocale((await headers()).get("accept-language"))];
  const { authorization_id: rawId } = await searchParams;
  const authorizationId = typeof rawId === "string" && authorizationIdPattern.test(rawId) ? rawId : null;
  if (!authorizationId) return <Problem copy={copy} message={copy.invalidRequest} />;

  const client = await createServerSupabaseClient();
  if (!client) return <Problem copy={copy} message={copy.unavailable} />;

  const { data: auth } = await client.auth.getUser();
  if (!auth.user) {
    return (
      <Panel copy={copy}>
        <h1 id="consent-title">{copy.signInTitle}</h1>
        <p>{copy.signInDescription}</p>
        <ConsentSignInForm
          authorizationId={authorizationId}
          labels={{
            email: copy.emailLabel,
            password: copy.passwordLabel,
            signIn: copy.signIn,
            signingIn: copy.signingIn,
          }}
        />
      </Panel>
    );
  }

  const [{ data: details, error }, isEditor] = await Promise.all([
    client.auth.oauth.getAuthorizationDetails(authorizationId),
    isEditorProfile(client, auth.user.id),
  ]);
  if (error || !details) return <Problem copy={copy} message={copy.expiredRequest} />;
  // The account already allowed this application for these scopes.
  if (!("authorization_id" in details)) {
    if (!isEditor) return <Problem copy={copy} message={copy.notAnEditor} />;
    if (!isRedirectAllowed(details.redirect_url)) {
      return <Problem copy={copy} message={copy.redirectNotAllowed(redirectHost(details.redirect_url))} />;
    }
    redirect(details.redirect_url);
  }
  if (!isRedirectAllowed(details.redirect_uri)) {
    return <Problem copy={copy} message={copy.redirectNotAllowed(redirectHost(details.redirect_uri))} />;
  }

  const clientName = details.client.name || redirectHost(details.redirect_uri);
  const scopes = details.scope.split(" ").filter(Boolean);
  const signedInAs = auth.user.email ?? details.user.email;

  return (
    <Panel copy={copy}>
      <h1 id="consent-title">{copy.requestTitle(clientName)}</h1>
      <p className="consent-redirect">
        {copy.returnsTo} <strong>{redirectHost(details.redirect_uri)}</strong>
      </p>
      <p>{copy.signedInAs(signedInAs)}</p>

      <dl className="consent-details">
        {details.client.uri ? (
          <div>
            <dt>{copy.website}</dt>
            <dd>{details.client.uri}</dd>
          </div>
        ) : null}
      </dl>
      <p className="consent-note">{copy.clientNameNote}</p>

      <section className="consent-section" aria-labelledby="consent-permissions">
        <h2 id="consent-permissions">{copy.permissionsTitle}</h2>
        <ul>
          {isEditor ? <li>{copy.newsroomAccess}</li> : null}
          {scopes.map((scope) => (
            <li key={scope}>{copy.scopeLabels[scope] ?? scope}</li>
          ))}
        </ul>
      </section>

      {isEditor ? null : (
        <p className="auth-form__error" role="alert">
          {copy.notAnEditor}
        </p>
      )}

      <DecisionForm
        authorizationId={authorizationId}
        canApprove={isEditor}
        labels={{
          approve: copy.approve,
          approving: copy.approving,
          deny: copy.deny,
          denying: copy.denying,
        }}
      />
      <p className="consent-note">{copy.revokeNote}</p>
      {isEditor ? null : (
        <form action={signOutOfConsent}>
          <input name="authorizationId" type="hidden" value={authorizationId} />
          <button className="auth-submit consent-deny" type="submit">
            {copy.notAnEditorAction}
          </button>
        </form>
      )}
    </Panel>
  );
}
