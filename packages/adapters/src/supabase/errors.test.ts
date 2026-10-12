import { describe, expect, it } from "vitest";

import { isUuid, throwIfError } from "./errors";

describe("throwIfError", () => {
  it("says what was being done, then why", () => {
    expect(() => throwIfError({ message: "permission denied" }, "Unable to list things")).toThrow("Unable to list things: permission denied");
    expect(() => throwIfError(null, "Unable to list things")).not.toThrow();
  });
});

describe("isUuid", () => {
  it("accepts the canonical form in either case and nothing else", () => {
    expect(isUuid("6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("6F1C2C1E-6A2B-4F7E-9D3E-1A2B3C4D5E6F")).toBe(true);
    for (const value of ["", "42", "not-a-uuid", "6f1c2c1e6a2b4f7e9d3e1a2b3c4d5e6f", "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f ", "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6g"]) {
      expect(isUuid(value), value).toBe(false);
    }
  });
});
