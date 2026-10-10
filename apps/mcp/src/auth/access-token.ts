import { createRemoteJWKSet, errors, jwtVerify } from "jose";

/** What the rest of the server may rely on once a Supabase-issued access token has verified. */
export interface AccessTokenClaims {
  /** The `auth.users` id, a UUID. */
  subject: string;
  /** The OAuth client that obtained the token. Only the OAuth server sets it. */
  clientId: string;
}

export interface AccessTokenVerifierOptions {
  issuer: string;
  jwksUrl: URL;
  /** Required audience; Supabase's own is `authenticated`. */
  audience: string | null;
  /** Seconds of clock skew tolerated on `exp` and `nbf`. */
  clockToleranceSeconds?: number;
  /** Minimum time between key-set reloads triggered by an unknown `kid`. */
  jwksCooldownMs?: number;
}

// Supabase signs with ES256 or RS256 once asymmetric keys are on. HS256 stays out: its secret
// never appears in the JWKS, and accepting it would let a public key pose as a shared secret.
const algorithms = ["ES256", "RS256"];
const maximumTokenLength = 8192;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Failures of the key source or the network, which say nothing about the token itself. */
function isInfrastructureError(error: unknown) {
  return error instanceof errors.JWKSTimeout
    || error instanceof errors.JWKSInvalid
    || !(error instanceof errors.JOSEError)
    || error.code === "ERR_JOSE_GENERIC";
}

/**
 * Verifies access tokens that Supabase Auth issued through its OAuth server: signature against
 * the project's JWKS (cached; an unknown `kid` reloads it, so rotation is picked up), issuer,
 * audience, expiry and not-before. Returns null for any token that is not valid for this
 * resource; throws only when the key source cannot be reached.
 */
export function createAccessTokenVerifier(options: AccessTokenVerifierOptions) {
  const jwks = createRemoteJWKSet(options.jwksUrl, {
    cooldownDuration: options.jwksCooldownMs ?? 30_000,
    // Supabase's edge caches the key set for ten minutes, so there is no use asking more often.
    cacheMaxAge: 600_000,
    timeoutDuration: 5_000,
  });

  return async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    if (token.length > maximumTokenLength || token.split(".").length !== 3) return null;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: options.issuer,
        audience: options.audience ?? "authenticated",
        algorithms,
        clockTolerance: options.clockToleranceSeconds ?? 5,
        requiredClaims: ["sub", "exp", "iss", "aud"],
      });
      // A session token of the Studio carries no client id. Only a token that went through the
      // OAuth server, with the user's consent for a client, may drive the newsroom.
      if (typeof payload.sub !== "string" || !uuid.test(payload.sub)) return null;
      if (typeof payload.client_id !== "string" || !payload.client_id) return null;
      if (payload.is_anonymous === true) return null;
      return { subject: payload.sub, clientId: payload.client_id };
    } catch (error) {
      if (isInfrastructureError(error)) throw error;
      return null;
    }
  };
}
