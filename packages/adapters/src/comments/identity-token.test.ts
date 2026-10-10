import { describe, expect, it } from "vitest";
import {
  createGuestToken,
  createNotificationToken,
  deriveCommentIdentityHash,
  verifyGuestToken,
  verifyNotificationToken,
} from "./identity-token";

const secret = "test-comment-secret-that-is-longer-than-thirty-two-bytes";
const id = "f0d16765-a03d-4c55-9e1c-fd6c6c87557f";

describe("comment identity tokens", () => {
  it("round-trips an expiring signed guest identity without exposing its source", () => {
    const token = createGuestToken(secret, 1_800_000_000_000, id);

    expect(verifyGuestToken(token.value, secret, 1_800_000_001_000)).toEqual({
      id,
      expiresAt: token.expiresAt,
    });
    expect(deriveCommentIdentityHash(secret, "guest-owner", id)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects tampered, expired, and differently signed guest identities", () => {
    const token = createGuestToken(secret, 1_800_000_000_000, id);

    expect(verifyGuestToken(`${token.value}x`, secret, 1_800_000_001_000)).toBeNull();
    expect(verifyGuestToken(token.value, `${secret}x`, 1_800_000_001_000)).toBeNull();
    expect(verifyGuestToken(token.value, secret, token.expiresAt)).toBeNull();
  });

  it("derives deterministic notification capabilities and verifies them in constant-time code", () => {
    const token = createNotificationToken(secret, id);

    expect(token).toHaveLength(80);
    expect(verifyNotificationToken(token, secret)).toBe(id);
    expect(verifyNotificationToken(token.replace(/.$/u, "x"), secret)).toBeNull();
  });
});
