const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function parseHttpUrl(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function isLocalHostname(hostname: string) {
  return localHostnames.has(hostname) || hostname.endsWith(".localhost");
}

export function isSecureProductionOrigin(url: URL) {
  return url.protocol === "https:" && !isLocalHostname(url.hostname);
}
