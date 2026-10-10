import { describe, expect, it } from "vitest";
import { getRequestNetworkAddress } from "./request-network";

describe("getRequestNetworkAddress", () => {
  it("prefers the edge address and canonicalizes it", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.99",
      "cf-connecting-ip": "2001:DB8::1, 198.51.100.2",
    });
    expect(getRequestNetworkAddress(headers)).toBe("2001:db8::1");
  });

  it("ignores a Vercel header that no host in this layout sets", () => {
    expect(getRequestNetworkAddress(new Headers({ "x-vercel-forwarded-for": "198.51.100.2" })))
      .toBe("unknown");
  });

  it("fails closed to one shared unknown bucket", () => {
    expect(getRequestNetworkAddress(new Headers({ "x-forwarded-for": "spoofed-host" })))
      .toBe("unknown");
    expect(getRequestNetworkAddress(new Headers({ "x-forwarded-for": "dead.beef" })))
      .toBe("unknown");
  });
});
