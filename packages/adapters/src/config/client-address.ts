import { isIP } from "node:net";

/**
 * The one request header the deployment trusts for the client's network address, named by
 * `ATLASNEWS_CLIENT_IP_HEADER` (for example `cf-connecting-ip` behind Cloudflare). A header that the
 * edge does not overwrite is attacker-controlled, so there is no fallback chain and no default:
 * unset means no network identity is derived from the request.
 */
export function getClientAddressHeader() {
  const name = process.env.ATLASNEWS_CLIENT_IP_HEADER?.trim().toLowerCase();
  return name && /^[a-z0-9-]{1,64}$/.test(name) ? name : null;
}

function expandIPv6(address: string) {
  let text = address.split("%", 1)[0];
  const tail = text.slice(text.lastIndexOf(":") + 1);
  if (tail.includes(".")) {
    const octets = tail.split(".").map(Number);
    const hex = (high: number, low: number) => ((high << 8) | low).toString(16);
    text = `${text.slice(0, text.lastIndexOf(":") + 1)}${hex(octets[0], octets[1])}:${hex(octets[2], octets[3])}`;
  }
  const [head, rest] = text.split("::");
  const front = head ? head.split(":") : [];
  const back = rest === undefined ? [] : rest ? rest.split(":") : [];
  const fill = rest === undefined ? [] : Array<string>(8 - front.length - back.length).fill("0");
  return [...front, ...fill, ...back].map((group) => group.padStart(4, "0"));
}

/**
 * Canonical key for one client network: an IPv4 address as is, an IPv6 address reduced to its /64
 * (one subscriber gets a whole /64, so per-address limits would never bind), an IPv4-mapped IPv6
 * address as its IPv4 form. Null when the value is not an IP address.
 */
export function networkKey(value: string) {
  const candidate = value.trim().slice(0, 96);
  const family = isIP(candidate);
  if (family === 4) return candidate;
  if (family !== 6) return null;
  const groups = expandIPv6(candidate.toLowerCase());
  if (groups.slice(0, 5).every((group) => group === "0000") && groups[5] === "ffff") {
    return [parseInt(groups[6].slice(0, 2), 16), parseInt(groups[6].slice(2), 16),
      parseInt(groups[7].slice(0, 2), 16), parseInt(groups[7].slice(2), 16)].join(".");
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/**
 * The client network of a request, read from the single configured header, or null when no header is
 * configured, it is absent or it is not an IP address. A comma list (`x-forwarded-for`) is read from the
 * right: the last entry is the one the trusted proxy appended; earlier ones are client-supplied.
 */
export function getClientNetwork(headers: Headers) {
  const name = getClientAddressHeader();
  if (!name) return null;
  const value = headers.get(name);
  if (!value) return null;
  return networkKey(value.split(",").at(-1) ?? "");
}
