import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createOAuthFlowSecrets, isOAuthProviderId, OAuthError, type OAuthProviderId } from "@atlasnews/adapters/auth/oauth";
import { createOAuthProvider } from "@atlasnews/adapters/auth/providers";
import {
  createFlowToken,
  createSessionToken,
  flowLifetimeSeconds,
  readFlowToken,
  timingSafeEqual,
} from "@atlasnews/adapters/auth/session";
import {
  getContentMode,
  getOAuthSignInEnvironment,
  getPublicSiteUrl,
  getSignInProviders,
} from "@atlasnews/adapters/config/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authCookieNames, authCookieOptions } from "./cookies";
import { localeOfPath, safeReturnPath } from "./return-path";
import { isSameOriginRequest } from "./same-origin";
import { readerDisplayName, type SignedInUser } from "./signed-in-user";

/**
 * The three routes of own sign-in, as plain request handlers (the route files only forward to them):
 *
 * - `start`: remembers the attempt (state, PKCE verifier, where to return) in a signed cookie and sends
 *   the browser to the provider.
 * - `callback`: accepts the provider's answer only for the attempt in that cookie, swaps the code for a
 *   verified profile and sets the session cookie.
 * - `signOut`: clears the session. POST and same-origin only.
 *
 * In `supabase` mode there is no cookie of ours: `start` asks Supabase Auth to run the same provider and
 * `/{locale}/auth/callback` finishes it.
 */

const noStore = "private, no-store, max-age=0";

function respond(response: NextResponse) {
  response.headers.set("Cache-Control", noStore);
  return response;
}

function notFound() {
  return respond(new NextResponse(null, { status: 404 }));
}

function redirectTo(path: string, status = 302) {
  return respond(NextResponse.redirect(new URL(path, getPublicSiteUrl()), status));
}

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", authCookieOptions(0));
}

/** The provider for a request, if sign-in with it is on here. */
function enabledProvider(value: string): OAuthProviderId | null {
  return isOAuthProviderId(value) && getSignInProviders().includes(value) ? value : null;
}

export async function startSignIn(request: NextRequest, providerId: string) {
  const provider = enabledProvider(providerId);
  if (!provider) return notFound();
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return_to"));

  if (getContentMode() === "supabase") return startWithSupabase(provider, returnTo);

  const environment = getOAuthSignInEnvironment();
  const credentials = environment?.providers[provider];
  if (!environment || !credentials) return notFound();

  const secrets = await createOAuthFlowSecrets();
  const flow = await createFlowToken(
    { provider, state: secrets.state, codeVerifier: secrets.codeVerifier, returnTo },
    environment.sessionSecret,
  );
  const authorizeUrl = createOAuthProvider(provider, credentials).authorizeUrl({
    redirectUri: callbackUrl(provider),
    state: secrets.state,
    codeChallenge: secrets.codeChallenge,
  });
  const response = redirectTo(authorizeUrl.toString());
  response.cookies.set(authCookieNames().flow, flow.value, authCookieOptions(flow.maxAge));
  return response;
}

function callbackUrl(provider: OAuthProviderId) {
  return new URL(`/api/auth/${provider}/callback`, getPublicSiteUrl()).toString();
}

async function startWithSupabase(provider: OAuthProviderId, returnTo: string) {
  const locale = localeOfPath(returnTo);
  const client = await createServerSupabaseClient();
  if (!client) return notFound();
  // The callback URL carries no query: Supabase allows redirects by exact URL. The return path waits in a cookie.
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: new URL(`/${locale}/auth/callback`, getPublicSiteUrl()).toString(), skipBrowserRedirect: true },
  });
  if (error || !data.url) return redirectTo(`/${locale}/login?error=oauth_failed`);
  const response = redirectTo(data.url);
  response.cookies.set(authCookieNames().next, returnTo, authCookieOptions(flowLifetimeSeconds));
  return response;
}

/** What went wrong, as the code the login page explains: `oauth_denied`, `oauth_email` or `oauth_failed`. */
function failureCode(error: unknown) {
  if (error instanceof OAuthError && (error.code === "email_unverified" || error.code === "email_missing")) {
    return "oauth_email";
  }
  return "oauth_failed";
}

export async function finishSignIn(request: NextRequest, providerId: string) {
  const provider = enabledProvider(providerId);
  const environment = getOAuthSignInEnvironment();
  if (!provider || !environment || getContentMode() === "supabase") return notFound();
  const credentials = environment.providers[provider];
  if (!credentials) return notFound();

  const names = authCookieNames();
  const flow = await readFlowToken(request.cookies.get(names.flow)?.value, environment.sessionSecret);
  const fail = (code: string) => {
    const response = redirectTo(`/${localeOfPath(flow?.returnTo ?? "/")}/login?error=${code}`);
    clearCookie(response, names.flow);
    return response;
  };

  // The attempt must be this browser's own, started for this provider, and answered with its state.
  const query = request.nextUrl.searchParams;
  const state = query.get("state");
  if (!flow || flow.provider !== provider || !state || !timingSafeEqual(state, flow.state)) return fail("oauth_failed");
  if (query.get("error")) return fail(query.get("error") === "access_denied" ? "oauth_denied" : "oauth_failed");
  const code = query.get("code");
  if (!code) return fail("oauth_failed");

  let profile;
  try {
    profile = await createOAuthProvider(provider, credentials).exchange({
      code,
      redirectUri: callbackUrl(provider),
      codeVerifier: flow.codeVerifier,
    });
  } catch (error) {
    return fail(failureCode(error));
  }

  const session = await createSessionToken(profile, environment.sessionSecret);
  // The path was made safe when the attempt started and is signed; checking it again costs nothing.
  const response = redirectTo(safeReturnPath(flow.returnTo));
  response.cookies.set(names.session, session.value, authCookieOptions(session.maxAge));
  clearCookie(response, names.flow);
  return response;
}

export async function signOut(request: NextRequest) {
  if (!isSameOriginRequest(request)) return respond(NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 }));
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return_to"));

  if (getContentMode() === "supabase") {
    const client = await createServerSupabaseClient();
    if (client) await client.auth.signOut();
  }
  // 303: the browser follows a POST with a GET of the page it returns to.
  const response = redirectTo(returnTo, 303);
  clearCookie(response, authCookieNames().session);
  return response;
}

/**
 * What the reader-facing pages need to offer sign-in: how to sign in here, and who is signed in. The
 * email stays on the server; the page gets the name it may prefill.
 */
export async function describeSession(getUser: () => Promise<SignedInUser | null>) {
  const user = await getUser();
  return respond(NextResponse.json({
    user: user ? { displayName: readerDisplayName(user), provider: user.provider } : null,
    providers: [...(getContentMode() === "sites" ? ["chatgpt"] : []), ...getSignInProviders()],
  }, { headers: { Vary: "Cookie" } }));
}
