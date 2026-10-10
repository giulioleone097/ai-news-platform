import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientAddressHeader, getClientNetwork, networkKey } from "./client-address";

afterEach(() => vi.unstubAllEnvs());

describe("networkKey", () => {
  it("keeps IPv4, unmaps IPv4-mapped IPv6 and reduces IPv6 to its /64", () => {
    expect(networkKey("198.51.100.2")).toBe("198.51.100.2");
    expect(networkKey("::ffff:198.51.100.2")).toBe("198.51.100.2");
    expect(networkKey("2001:DB8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:0db8:0001:0002::/64");
    expect(networkKey("2001:db8:1:2::9")).toBe(networkKey("2001:db8:1:2:ffff::1"));
    expect(networkKey("2001:db8:1:3::9")).not.toBe(networkKey("2001:db8:1:2::9"));
    expect(networkKey("::1")).toBe("0000:0000:0000:0000::/64");
  });

  it("rejects anything that is not an IP address", () => {
    expect(networkKey("spoofed-host")).toBeNull();
    expect(networkKey("dead.beef")).toBeNull();
    expect(networkKey("")).toBeNull();
  });
});

describe("getClientNetwork", () => {
  const spoofed = new Headers({
    "x-vercel-forwarded-for": "198.51.100.9",
    "x-forwarded-for": "198.51.100.8",
    "x-real-ip": "198.51.100.7",
    "cf-connecting-ip": "203.0.113.1",
  });

  it("derives nothing from the request while no header is configured", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "");
    expect(getClientNetwork(spoofed)).toBeNull();
  });

  it("reads exactly the configured header and ignores every other one", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "CF-Connecting-IP");
    expect(getClientAddressHeader()).toBe("cf-connecting-ip");
    expect(getClientNetwork(spoofed)).toBe("203.0.113.1");
    expect(getClientNetwork(new Headers({ "x-forwarded-for": "198.51.100.8" }))).toBeNull();
  });

  it("reads a comma list from the right, where the trusted proxy appends", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "x-forwarded-for");
    expect(getClientNetwork(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.1" }))).toBe("203.0.113.1");
  });

  it("ignores an invalid header name", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "bad header");
    expect(getClientAddressHeader()).toBeNull();
  });
});
