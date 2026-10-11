import { createGithubProvider } from "./github";
import { createGoogleProvider } from "./google";
import type { Fetcher, OAuthCredentials, OAuthProvider, OAuthProviderId } from "./oauth";

/** The adapter for one provider; the one place that maps an id to its implementation. */
export function createOAuthProvider(
  id: OAuthProviderId,
  credentials: OAuthCredentials,
  fetcher?: Fetcher,
): OAuthProvider {
  return id === "google" ? createGoogleProvider(credentials, fetcher) : createGithubProvider(credentials, fetcher);
}
