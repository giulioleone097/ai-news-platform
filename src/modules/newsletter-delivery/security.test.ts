import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildConfirmationToken,
  createConfirmationChallenge,
  createUnsubscribeToken,
  hashNewsletterRequestFingerprint,
  parseConfirmationToken,
  verifySvixWebhook,
  verifyUnsubscribeToken,
} from "./security";

const recipientId = "11111111-1111-4111-8111-111111111111";
const subscriptionId = "22222222-2222-4222-8222-222222222222";

describe("newsletter delivery tokens", () => {
  it("pseudonymizes requesters with a secret-bound domain", () => {
    const secret = "unsubscribe-secret-with-at-least-32-characters";
    const fingerprint = hashNewsletterRequestFingerprint("  Studio:Editor-1 ", secret);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).toBe(hashNewsletterRequestFingerprint("studio:editor-1", secret));
    expect(fingerprint).not.toContain("editor-1");
    expect(fingerprint).not.toBe(hashNewsletterRequestFingerprint("studio:editor-1", `${secret}x`));
  });

  it("creates one-time confirmation challenges without storing the raw secret", () => {
    const challenge = createConfirmationChallenge();
    const token = buildConfirmationToken(subscriptionId, challenge.secret);
    expect(challenge.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(parseConfirmationToken(token)).toEqual({
      subscriptionId,
      tokenHash: challenge.hash,
    });
    expect(parseConfirmationToken(`${token}x`)).not.toEqual({
      subscriptionId,
      tokenHash: challenge.hash,
    });
  });

  it("signs unsubscribe capabilities and rejects tampering", () => {
    const secret = "unsubscribe-secret-with-at-least-32-characters";
    const token = createUnsubscribeToken({ recipientId, subscriptionId }, secret);
    expect(verifyUnsubscribeToken(token, secret)).toEqual({
      recipientId,
      subscriptionId,
      version: 1,
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifyUnsubscribeToken(tampered, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, `${secret}x`)).toBeNull();
  });
});

describe("Svix verification", () => {
  it("verifies the raw body, identifier and timestamp", () => {
    const key = Buffer.from("resend-webhook-test-key-32-bytes!");
    const secret = `whsec_${key.toString("base64")}`;
    const id = "msg_01";
    const timestamp = "1800000000";
    const body = '{"type":"email.delivered"}';
    const signature = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");

    expect(verifySvixWebhook({
      body,
      id,
      timestamp,
      signature: `v1,${signature}`,
      secret,
      now: 1_800_000_100,
    })).toBe(true);
    expect(verifySvixWebhook({
      body: `${body} `,
      id,
      timestamp,
      signature: `v1,${signature}`,
      secret,
      now: 1_800_000_100,
    })).toBe(false);
    expect(verifySvixWebhook({
      body,
      id,
      timestamp,
      signature: `v1,${signature}`,
      secret,
      now: 1_800_001_000,
    })).toBe(false);
  });
});
