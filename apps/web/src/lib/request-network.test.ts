import { afterEach, describe, expect, it, vi } from "vitest";
import { getRequestNetworkAddress } from "./request-network";

afterEach(() => vi.unstubAllEnvs());

describe("getRequestNetworkAddress", () => {
  const clientHeaders = {
    "x-vercel-forwarded-for": "198.51.100.2",
    "x-forwarded-for": "203.0.113.99",
    "x-real-ip": "203.0.113.98",
  };

  it("uses the one configured header and canonicalizes it", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(getRequestNetworkAddress(new Headers({ ...clientHeaders, "cf-connecting-ip": "2001:DB8:1:2::1" })))
      .toBe("2001:0db8:0001:0002::/64");
  });

  it("gives no shared bucket and no spoofable one when no header is configured", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "");
    const first = getRequestNetworkAddress(new Headers(clientHeaders));
    const second = getRequestNetworkAddress(new Headers(clientHeaders));
    expect(first).toMatch(/^unscoped:/);
    expect(second).not.toBe(first);
    for (const value of Object.values(clientHeaders)) expect(first).not.toContain(value);
  });

  it("does not fall back to another header when the configured one is missing or invalid", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(getRequestNetworkAddress(new Headers(clientHeaders))).toMatch(/^unscoped:/);
    expect(getRequestNetworkAddress(new Headers({ "cf-connecting-ip": "spoofed-host" }))).toMatch(/^unscoped:/);
  });
});
