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
 * Google through OpenID Connect (authorization code with PKCE). The profile comes from the userinfo
 * endpoint with the access token Google just issued over TLS, and the email counts only when Google
 * says `email_verified`.
 */
const authorizeEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const userinfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";

export function createGoogleProvider(credentials: OAuthCredentials, fetcher: Fetcher = fetch): OAuthProvider {
  return {
    id: "google",

    authorizeUrl({ redirectUri, state, codeChallenge }) {
      const url = new URL(authorizeEndpoint);
      url.search = new URLSearchParams({
        client_id: credentials.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        // Let a person with several Google accounts choose the one to sign in with.
        prompt: "select_account",
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
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            code_verifier: codeVerifier,
          }),
        },
        { code: "exchange_failed", message: "Google did not accept the authorization code." },
      );
      if (typeof token.access_token !== "string" || !token.access_token) {
        throw new OAuthError("exchange_failed", "Google returned no access token.");
      }

      const profile = await requestJson(
        fetcher,
        userinfoEndpoint,
        { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" } },
        { code: "profile_failed", message: "Google did not return the profile." },
      );
      const subject = typeof profile.sub === "string" ? profile.sub : "";
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(subject)) {
        throw new OAuthError("profile_failed", "Google returned no account id.");
      }
      const email = cleanEmail(profile.email);
      if (!email) throw new OAuthError("email_missing", "The Google account has no email address.");
      // Google sends a boolean; older answers carried the string "true".
      if (profile.email_verified !== true && profile.email_verified !== "true") {
        throw new OAuthError("email_unverified", "Google has not verified this email address.");
      }
      return {
        provider: "google",
        providerUserId: subject,
        email,
        emailVerified: true,
        name: cleanName(profile.name),
      };
    },
  };
}
