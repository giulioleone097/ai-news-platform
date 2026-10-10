import type { AccessTokenVerifier } from "../auth";
import { createAccessTokenVerifier, type AccessTokenVerifierOptions } from "./access-token";
import { scopesForRole, type EditorDirectory } from "./editors";

/**
 * The bearer verifier for tokens that Supabase Auth issued to a client such as ChatGPT or Claude.
 * A verified token proves who signed in; the profile table decides whether that person is an
 * editor, so a valid token for a reader gets a caller with no newsroom scope at all.
 */
export function supabaseOAuthVerifier(
  token: AccessTokenVerifierOptions,
  editors: EditorDirectory,
): AccessTokenVerifier {
  const verifyAccessToken = createAccessTokenVerifier(token);
  return {
    async verify(bearer) {
      const claims = await verifyAccessToken(bearer);
      if (!claims) return null;
      const profile = await editors.find(claims.subject);
      const scopes = scopesForRole(profile?.role);
      return { subject: claims.subject, scopes, ...(scopes.length && profile ? { authorId: profile.authorId } : {}) };
    },
  };
}
