import { isIP } from "node:net";

type Cidr4 = readonly [string, number];

// Non-public IPv4 space (RFC 1122, 1918, 6598, 5737, 6890 and friends).
const blockedIpv4: readonly Cidr4[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inCidr(value: number, [base, bits]: Cidr4) {
  const size = 2 ** (32 - bits);
  const start = parseIpv4(base) as number;
  return value >= start && value < start + size;
}

function isPublicIpv4Value(value: number) {
  return !blockedIpv4.some((range) => inCidr(value, range));
}

/** Expands an IPv6 literal into eight 16-bit groups, or null when it is malformed. */
function parseIpv6(address: string): number[] | null {
  let text = address.split("%")[0].toLowerCase();
  const embedded = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) {
    const v4 = parseIpv4(embedded[1]);
    if (v4 === null) return null;
    text = `${text.slice(0, -embedded[1].length)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function embeddedIpv4(high: number, low: number) {
  return high * 65536 + low;
}

function isPublicIpv6(groups: number[]) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const upperZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // ::, ::1, IPv4-compatible (::/96) and IPv4-mapped (::ffff:0:0/96).
  if (upperZero && g5 === 0xffff) return isPublicIpv4Value(embeddedIpv4(g6, g7));
  if (upperZero && g5 === 0) return false;
  // Well-known NAT64 prefix embeds an IPv4 address; the local-use prefix is not public.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicIpv4Value(embeddedIpv4(g6, g7));
  }
  // 6to4 embeds the IPv4 address in groups 1 and 2.
  if (g0 === 0x2002) return isPublicIpv4Value(embeddedIpv4(g1, g2));
  // Only global unicast 2000::/3 is routable; carve out special-purpose blocks inside it.
  if ((g0 & 0xe000) !== 0x2000) return false;
  if (g0 === 0x2001 && g1 < 0x200) return false; // 2001::/23 (Teredo, benchmarking, ORCHID, ...)
  if (g0 === 0x2001 && g1 === 0xdb8) return false; // documentation
  if (g0 === 0x3fff && g1 < 0x1000) return false; // documentation 3fff::/20
  return true;
}

/** True only for globally routable unicast IPv4/IPv6 addresses. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = parseIpv4(address);
    return value !== null && isPublicIpv4Value(value);
  }
  if (family === 6) {
    const groups = parseIpv6(address);
    return groups !== null && isPublicIpv6(groups);
  }
  return false;
}
