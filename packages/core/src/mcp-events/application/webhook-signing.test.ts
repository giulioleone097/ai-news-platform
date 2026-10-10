import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { otherSecret, testSecret } from "../test-support";
import { decodeSigningSecret } from "./signing-secret";
import { buildWebhookHeaders, signWebhook } from "./webhook-signing";

describe("signing secret", () => {
  it("accepts whsec_ secrets that decode to 24-64 bytes", () => {
    expect(decodeSigningSecret(testSecret)?.byteLength).toBe(24);
    expect(decodeSigningSecret(`whsec_${Buffer.alloc(64, 1).toString("base64")}`)?.byteLength).toBe(64);
  });

  it("rejects wrong prefix, bad base64 and out-of-range sizes", () => {
    expect(decodeSigningSecret("MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw")).toBeNull();
    expect(decodeSigningSecret("whsec_")).toBeNull();
    expect(decodeSigningSecret("whsec_not base64!!")).toBeNull();
    expect(decodeSigningSecret(`whsec_${Buffer.alloc(23, 1).toString("base64")}`)).toBeNull();
    expect(decodeSigningSecret(`whsec_${Buffer.alloc(65, 1).toString("base64")}`)).toBeNull();
  });
});

describe("Standard Webhooks signing", () => {
  it("matches the published Standard Webhooks test vector", () => {
    expect(signWebhook({
      secret: testSecret,
      messageId: "msg_p5jXN8AQM9LWM0D4loKWxJek",
      timestampSeconds: 1614265330,
      body: '{"test": 2432232314}',
    })).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("signs id.timestamp.body with the base64-decoded key", () => {
    const body = '{"eventId":"evt_1","data":{"title":"Ünïcode"}}';
    const key = Buffer.from(otherSecret.slice(6), "base64");
    const expected = createHmac("sha256", key).update(`evt_1.1760097600.${body}`).digest("base64");
    expect(signWebhook({ secret: otherSecret, messageId: "evt_1", timestampSeconds: 1760097600, body }))
      .toBe(`v1,${expected}`);
  });

  it("builds delivery headers and signs with both secrets during rotation", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const body = "{}";
    const headers = buildWebhookHeaders({
      messageId: "evt_1",
      subscriptionId: "sub_1",
      secrets: [otherSecret, testSecret],
      body,
      now,
    });
    const seconds = Math.floor(now.getTime() / 1000);
    expect(headers).toMatchObject({
      "Content-Type": "application/json",
      "webhook-id": "evt_1",
      "webhook-timestamp": String(seconds),
      "X-MCP-Subscription-Id": "sub_1",
    });
    expect(headers["webhook-signature"].split(" ")).toEqual([
      signWebhook({ secret: otherSecret, messageId: "evt_1", timestampSeconds: seconds, body }),
      signWebhook({ secret: testSecret, messageId: "evt_1", timestampSeconds: seconds, body }),
    ]);
  });
});
