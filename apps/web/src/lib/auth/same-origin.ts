import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";

/**
 * Whether a state-changing request comes from this site's own pages: a browser always sends `Origin` on
 * a POST and `Sec-Fetch-Site` on any request; without an `Origin` the request counts only when the
 * browser vouches that it is same-origin.
 */
export function isSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (origin === null) return fetchSite === "same-origin";
  const allowed = new Set([new URL(request.url).origin, getPublicSiteUrl().origin]);
  return allowed.has(origin);
}
