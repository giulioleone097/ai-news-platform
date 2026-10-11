import { describe, expect, it } from "vitest";
import { encodeBase64Url } from "./base64url";
import { createGithubProvider } from "./github";
import { createGoogleProvider } from "./google";
import { OAuthError, createOAuthFlowSecrets, type OAuthProvider } from "./oauth";

const credentials = { clientId: "client-id", clientSecret: "client-secret" };
const redirectUri = "https://news.example.com/api/auth/google/callback";

type Route = (request: { url: string; init: RequestInit }) => Response;

/** A fetch that answers by URL and records every call. */
function mockFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`unexpected request to ${url}`);
    return route({ url, init });
  }) as typeof fetch;
  return { fetcher, calls };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

async function expectRejection(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(OAuthError);
  expect((error as OAuthError).code).toBe(code);
  return error as OAuthError;
}

describe("OAuth flow secrets", () => {
  it("makes a state, a PKCE verifier and its S256 challenge, different every time", async () => {
    const first = await createOAuthFlowSecrets();
    const second = await createOAuthFlowSecrets();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(first.codeVerifier));

    expect(first.codeChallenge).toBe(encodeBase64Url(new Uint8Array(digest)));
    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(first.state).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(second.state).not.toBe(first.state);
    expect(second.codeVerifier).not.toBe(first.codeVerifier);
  });
});

describe("Google", () => {
  const exchangeInput = { code: "the-code", redirectUri, codeVerifier: "verifier-value" };

  function google(userinfo: Record<string, unknown>, token: Response = json({ access_token: "google-token", id_token: "ignored" })) {
    const mock = mockFetch({
      "https://oauth2.googleapis.com/token": () => token,
      "https://openidconnect.googleapis.com/v1/userinfo": () => json(userinfo),
    });
    return { provider: createGoogleProvider(credentials, mock.fetcher), ...mock };
  }

  it("sends the person to Google with the state and the S256 challenge", () => {
    const url = createGoogleProvider(credentials, mockFetch({}).fetcher).authorizeUrl({ redirectUri, state: "s-1", codeChallenge: "c-1" });

    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-id",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: "s-1",
      code_challenge: "c-1",
      code_challenge_method: "S256",
    });
    expect(url.search).not.toContain("client-secret");
  });

  it("exchanges the code with the PKCE verifier and returns the verified profile", async () => {
    const { provider, calls } = google({ sub: "1042", email: "Giulia@Example.com", email_verified: true, name: "  Giulia  Rossi " });

    expect(await provider.exchange(exchangeInput)).toEqual({
      provider: "google",
      providerUserId: "1042",
      email: "giulia@example.com",
      emailVerified: true,
      name: "Giulia Rossi",
    });
    const tokenBody = new URLSearchParams(String(calls[0]?.init.body));
    expect(Object.fromEntries(tokenBody)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: redirectUri,
      client_id: "client-id",
      client_secret: "client-secret",
      code_verifier: "verifier-value",
    });
    expect((calls[1]?.init.headers as Record<string, string>).Authorization).toBe("Bearer google-token");
  });

  it("refuses an email Google has not verified, or none", async () => {
    await expectRejection(google({ sub: "1", email: "a@example.com", email_verified: false }).provider.exchange(exchangeInput), "email_unverified");
    await expectRejection(google({ sub: "1", email: "a@example.com" }).provider.exchange(exchangeInput), "email_unverified");
    await expectRejection(google({ sub: "1", email_verified: true }).provider.exchange(exchangeInput), "email_missing");
  });

  it("fails without leaking Google's answer when the code is rejected or the profile is malformed", async () => {
    const rejected = await expectRejection(
      google({}, json({ error: "invalid_grant", error_description: "secret-detail" }, 400)).provider.exchange(exchangeInput),
      "exchange_failed",
    );
    expect(rejected.message).not.toContain("secret-detail");
    await expectRejection(google({}, json({})).provider.exchange(exchangeInput), "exchange_failed");
    await expectRejection(google({ email: "a@example.com", email_verified: true }).provider.exchange(exchangeInput), "profile_failed");
  });
});

describe("GitHub", () => {
  const exchangeInput = { code: "the-code", redirectUri: "https://news.example.com/api/auth/github/callback", codeVerifier: "verifier-value" };

  function github(options: { user?: Record<string, unknown>; emails?: unknown; token?: Response }) {
    const mock = mockFetch({
      "https://github.com/login/oauth/access_token": () => options.token ?? json({ access_token: "gh-token", token_type: "bearer" }),
      "https://api.github.com/user": () => json(options.user ?? { id: 77, login: "ada", name: "Ada Lovelace", email: "public@example.com" }),
      "https://api.github.com/user/emails": () => json(options.emails ?? []),
    });
    return { provider: createGithubProvider(credentials, mock.fetcher), ...mock };
  }

  it("sends the person to GitHub with the state and the S256 challenge", () => {
    const url = createGithubProvider(credentials, mockFetch({}).fetcher).authorizeUrl({
      redirectUri: exchangeInput.redirectUri,
      state: "s-1",
      codeChallenge: "c-1",
    });

    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-id",
      state: "s-1",
      code_challenge: "c-1",
      code_challenge_method: "S256",
      scope: "read:user user:email",
    });
  });

  it("uses the primary verified email, never the public profile email", async () => {
    const { provider, calls } = github({
      emails: [
        { email: "secondary@example.com", primary: false, verified: true },
        { email: "Primary@Example.com", primary: true, verified: true },
      ],
    });

    expect(await provider.exchange(exchangeInput)).toEqual({
      provider: "github",
      providerUserId: "77",
      email: "primary@example.com",
      emailVerified: true,
      name: "Ada Lovelace",
    });
    const tokenBody = new URLSearchParams(String(calls[0]?.init.body));
    expect(tokenBody.get("code_verifier")).toBe("verifier-value");
    expect(tokenBody.get("client_secret")).toBe("client-secret");
    expect((calls[0]?.init.headers as Record<string, string>).Accept).toBe("application/json");
    expect((calls[1]?.init.headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("falls back to the login when the account has no name", async () => {
    const { provider } = github({
      user: { id: 5, login: "octo", name: null },
      emails: [{ email: "o@example.com", primary: true, verified: true }],
    });
    expect((await provider.exchange(exchangeInput)).name).toBe("octo");
  });

  it("refuses an account whose primary email is unverified or that has no primary", async () => {
    await expectRejection(
      github({ emails: [{ email: "a@example.com", primary: true, verified: false }, { email: "b@example.com", primary: false, verified: true }] }).provider.exchange(exchangeInput),
      "email_unverified",
    );
    await expectRejection(github({ emails: [] }).provider.exchange(exchangeInput), "email_unverified");
  });

  it("treats GitHub's 200 answer with an error as a failed exchange", async () => {
    const token = json({ error: "bad_verification_code", error_description: "secret-detail" });
    const error = await expectRejection(github({ token }).provider.exchange(exchangeInput), "exchange_failed");
    expect(error.message).not.toContain("secret-detail");
  });

  it("fails when the profile or the email list cannot be read", async () => {
    await expectRejection(github({ user: { login: "ada" } }).provider.exchange(exchangeInput), "profile_failed");
    await expectRejection(github({ emails: { message: "Requires authentication" } }).provider.exchange(exchangeInput), "profile_failed");
  });
});

describe("the provider interface", () => {
  it("is the same shape for both providers", () => {
    const providers: OAuthProvider[] = [createGoogleProvider(credentials), createGithubProvider(credentials)];
    expect(providers.map((provider) => provider.id)).toEqual(["google", "github"]);
  });
});
