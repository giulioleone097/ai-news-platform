import { describe, expect, it } from "vitest";

import { normalizeEnqueueInput } from "./validation";

const publicationId = "9b984e7b-1aa8-4f2a-bd9b-f799f4b7529e";

describe("social publication validation", () => {
  it("derives one deterministic idempotency key per publication/provider", () => {
    const input = {
      publicationId,
      provider: "linkedin" as const,
      payload: { text: " AI briefing " },
    };
    expect(normalizeEnqueueInput(input)).toMatchObject({
      idempotencyKey: normalizeEnqueueInput(input).idempotencyKey,
      payload: { text: "AI briefing" },
      maxAttempts: 5,
    });
    expect(normalizeEnqueueInput(input).idempotencyKey).toMatch(/^social:linkedin:[a-f0-9]{32}$/);
  });

  it("requires and normalizes an explicit WhatsApp recipient", () => {
    expect(normalizeEnqueueInput({
      publicationId,
      provider: "whatsapp",
      payload: { text: "AI briefing", recipient: "+15551234567" },
    }).payload.recipient).toBe("15551234567");
    expect(() => normalizeEnqueueInput({
      publicationId,
      provider: "whatsapp",
      payload: { text: "AI briefing" },
    })).toThrow("explicit recipient");
  });

  it("rejects recipient leakage into public-feed providers", () => {
    expect(() => normalizeEnqueueInput({
      publicationId,
      provider: "x",
      payload: { text: "AI briefing", recipient: "+15551234567" },
    })).toThrow("only valid for WhatsApp");
  });

  it("accepts only credential-free HTTPS article URLs", () => {
    expect(() => normalizeEnqueueInput({
      publicationId,
      provider: "x",
      payload: { text: "AI briefing", articleUrl: "http://localhost/article" },
    })).toThrow("public HTTPS URL");
    expect(() => normalizeEnqueueInput({
      publicationId,
      provider: "x",
      payload: { text: "AI briefing", articleUrl: "https://user:pass@example.com/article" },
    })).toThrow("public HTTPS URL");
  });
});
