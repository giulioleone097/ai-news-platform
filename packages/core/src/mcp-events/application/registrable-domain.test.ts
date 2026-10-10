import { describe, expect, it } from "vitest";
import { registrableDomain } from "./registrable-domain";

describe("registrableDomain", () => {
  it("keeps the last two labels, three below a country's co/com label", () => {
    expect(registrableDomain("a.b.Example.com")).toBe("example.com");
    expect(registrableDomain("receiver.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("shop.example.com.au.")).toBe("example.com.au");
    expect(registrableDomain("example.com")).toBe("example.com");
  });

  it("leaves single labels and IP literals alone", () => {
    expect(registrableDomain("localhost")).toBe("localhost");
    expect(registrableDomain("203.0.113.9")).toBe("203.0.113.9");
    expect(registrableDomain("[2001:db8::1]")).toBe("[2001:db8::1]");
  });
});
