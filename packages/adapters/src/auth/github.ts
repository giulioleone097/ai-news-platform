import {
  OAuthError,
  cleanEmail,
  cleanName,
  formBody,
  requestJson,
  type Fetcher,
  type OAuthCredentials,
  type OAuthProvider,
} from "./oauth";

/**
 * GitHub as an OAuth app (authorization code with PKCE). GitHub has no verified-email claim on the
 * profile, so the address is the primary one of `/user/emails` and only when GitHub marks it verified;
 * an account without one is refused. The public `email` of `/user` is never used: anyone can type it.
 */
const authorizeEndpoint = "https://github.com/login/oauth/authorize";
const tokenEndpoint = "https://github.com/login/oauth/access_token";
const apiEndpoint = "https://api.github.com";

function apiHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub rejects API requests without one.
    "User-Agent": "AtlasNews",
  };
}

export function createGithubProvider(credentials: OAuthCredentials, fetcher: Fetcher = fetch): OAuthProvider {
  return {
    id: "github",

    authorizeUrl({ redirectUri, state, codeChallenge }) {
      const url = new URL(authorizeEndpoint);
      url.search = new URLSearchParams({
        client_id: credentials.clientId,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return url;
    },

    async exchange({ code, redirectUri, codeVerifier }) {
      const token = await requestJson(
        fetcher,
        tokenEndpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: formBody({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        },
        { code: "exchange_failed", message: "GitHub did not accept the authorization code." },
      );
      // GitHub answers 200 with an `error` field for a bad code.
      if (typeof token.access_token !== "string" || !token.access_token) {
        throw new OAuthError("exchange_failed", "GitHub returned no access token.");
      }

      const profile = await requestJson(
        fetcher,
        `${apiEndpoint}/user`,
        { headers: apiHeaders(token.access_token) },
        { code: "profile_failed", message: "GitHub did not return the profile." },
      );
      if (typeof profile.id !== "number" || !Number.isSafeInteger(profile.id) || profile.id <= 0) {
        throw new OAuthError("profile_failed", "GitHub returned no account id.");
      }

      const email = await primaryVerifiedEmail(fetcher, token.access_token);
      return {
        provider: "github",
        providerUserId: String(profile.id),
        email,
        emailVerified: true,
        name: cleanName(profile.name) ?? cleanName(profile.login),
      };
    },
  };
}

async function primaryVerifiedEmail(fetcher: Fetcher, accessToken: string) {
  const entries = await requestJson<unknown[]>(
    fetcher,
    `${apiEndpoint}/user/emails`,
    { headers: apiHeaders(accessToken) },
    { code: "profile_failed", message: "GitHub did not return the email addresses." },
  );
  if (!Array.isArray(entries)) throw new OAuthError("profile_failed", "GitHub did not return the email addresses.");

  for (const entry of entries as Array<Record<string, unknown> | null>) {
    if (entry?.primary === true && entry.verified === true) {
      const email = cleanEmail(entry.email);
      if (email) return email;
    }
  }
  throw new OAuthError("email_unverified", "The GitHub account has no verified primary email address.");
}
