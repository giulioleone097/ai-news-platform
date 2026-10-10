import { describe, expect, it } from "vitest";

import {
  defaultSubscriptionTtlMs,
  grantSubscriptionTtl,
  maximumSubscriptionTtlMs,
  minimumSubscriptionTtlMs,
} from "./subscription-ttl";

describe("subscription TTL", () => {
  it("defaults to seven days and never grants an unbounded lifetime", () => {
    expect(defaultSubscriptionTtlMs).toBe(7 * 24 * 3600 * 1000);
    expect(grantSubscriptionTtl(undefined)).toBe(defaultSubscriptionTtlMs);
    expect(grantSubscriptionTtl(null)).toBe(defaultSubscriptionTtlMs);
  });

  it("honors smaller requests down to one hour and caps at thirty days", () => {
    expect(grantSubscriptionTtl(2 * 3600 * 1000)).toBe(2 * 3600 * 1000);
    expect(grantSubscriptionTtl(1_000)).toBe(minimumSubscriptionTtlMs);
    expect(grantSubscriptionTtl(90 * 24 * 3600 * 1000)).toBe(maximumSubscriptionTtlMs);
    expect(grantSubscriptionTtl(20 * 24 * 3600 * 1000)).toBe(20 * 24 * 3600 * 1000);
  });
});
