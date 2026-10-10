const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether an OAuth redirect URI may receive an authorization code: HTTPS on an allowed host, or plain
 * HTTP on loopback (RFC 8252, a local application). Hosts match exactly; `*.example.com` allows any
 * subdomain but not `example.com` itself. Anything else, including custom schemes and URLs with
 * credentials, is refused: an attacker can register a client with any redirect URI, so the host is the
 * only thing that says where the code goes.
 */
export function isAllowedRedirectUri(redirectUri: string, allowedHosts: readonly string[]) {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (url.protocol === "http:" ? !loopbackHosts.has(host) : url.protocol !== "https:") return false;
  return allowedHosts.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    return allowed.startsWith("*.") ? host.endsWith(allowed.slice(1)) : host === allowed;
  });
}
