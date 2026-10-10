import { isIP } from "node:net";

// Second-level labels that countries use below their two-letter code (example.co.uk, example.com.au).
const countrySecondLevel = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);

/**
 * The domain a callback host belongs to, for counting subscriptions across subdomains: wildcard DNS
 * gives an attacker unlimited hostnames under one domain they own.
 *
 * ceiling: this is the last two labels (three below a country's co/com/org/... label), not the Public
 * Suffix List. A shared suffix such as github.io or workers.dev counts all its tenants as one domain,
 * which only makes the limit stricter for them. Upgrade to a suffix list if that ever blocks a real host.
 */
export function registrableDomain(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".")) return host;
  const labels = host.split(".");
  const keep = labels.at(-1)!.length === 2 && countrySecondLevel.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-keep).join(".");
}
