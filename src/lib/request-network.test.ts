import { describe, expect, it } from "vitest";
import { getRequestNetworkAddress } from "./request-network";

describe("getRequestNetworkAddress", () => {
  it("prefers the Vercel address and canonicalizes it", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.99",
      "x-vercel-forwarded-for": "2001:DB8::1, 198.51.100.2",
    });
    expect(getRequestNetworkAddress(headers)).toBe("2001:db8::1");
  });

  it("fails closed to one shared unknown bucket", () => {
    expect(getRequestNetworkAddress(new Headers({ "x-forwarded-for": "spoofed-host" })))
      .toBe("unknown");
    expect(getRequestNetworkAddress(new Headers({ "x-forwarded-for": "dead.beef" })))
      .toBe("unknown");
  });
});
