import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256, randomBytes, randomUuid, sha256Hex, timingSafeEqualBytes, toHex } from "./crypto";

describe("core crypto", () => {
  it("hashes like the platform SHA-256 at every padding boundary", () => {
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
      const text = "é".repeat(length);
      expect(sha256Hex(text), `${length} characters`).toBe(createHash("sha256").update(text).digest("hex"));
    }
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("signs like the platform HMAC-SHA-256 with short, block-sized and long keys", () => {
    const keys = ["k", "secret", "x".repeat(64), "y".repeat(65), "z".repeat(200)];
    for (const key of keys) {
      expect(toHex(hmacSha256(key, "id.123.{}"))).toBe(createHmac("sha256", key).update("id.123.{}").digest("hex"));
    }
    const raw = Uint8Array.from({ length: 32 }, (_, index) => index * 7);
    expect(toHex(hmacSha256(raw, "body"))).toBe(createHmac("sha256", raw).update("body").digest("hex"));
  });

  it("compares bytes by value and length", () => {
    expect(timingSafeEqualBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(timingSafeEqualBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(timingSafeEqualBytes(Uint8Array.of(1), Uint8Array.of(1, 2))).toBe(false);
  });

  it("draws fresh ids and bytes", () => {
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomUuid()).not.toBe(randomUuid());
    expect(randomBytes(24)).toHaveLength(24);
  });
});
