import { isLocalHostname } from "@atlasnews/adapters/config/url-policy";
import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";

/**
 * Cookie policy of own sign-in. Both cookies are HttpOnly, SameSite=Lax (the provider sends the browser
 * back with a top-level GET, which Lax allows) and `Secure` with the `__Host-` prefix, which pins them to
 * this exact host and path. Only a loopback site served over plain http (local development) gets neither
 * `Secure` nor the prefix, because browsers refuse a `__Host-` cookie without `Secure`.
 */
export function isSecureCookieSite(siteUrl = getPublicSiteUrl()) {
  return !(siteUrl.protocol === "http:" && isLocalHostname(siteUrl.hostname));
}

export function authCookieNames(secure = isSecureCookieSite()) {
  const prefix = secure ? "__Host-" : "";
  return {
    session: `${prefix}atlasnews_session`,
    flow: `${prefix}atlasnews_oauth`,
    /** Supabase mode only: where to go after `/{locale}/auth/callback`, which Supabase allows by exact URL. */
    next: `${prefix}atlasnews_signin_next`,
  } as const;
}

export function authCookieOptions(maxAgeSeconds: number, secure = isSecureCookieSite()) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
