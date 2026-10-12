import { describe, expect, it } from "vitest";

import type { SocialOutboxJob } from "../domain/social-publication";
import { normalizeEnqueueInput, normalizePendingUpdate } from "./validation";

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

describe("pending social job edits", () => {
  const now = new Date("2026-10-12T08:00:00.000Z");
  const job = {
    id: "fc7c6331-56a3-42dc-8932-6b4394bc4c9f",
    provider: "whatsapp",
    payload: { text: "Private briefing", articleUrl: "https://atlasnews.example/en/articles/a", recipient: "15551234567" },
    attempts: 1,
    maxAttempts: 5,
    availableAt: "2026-10-12T09:00:00.000Z",
    revision: 2,
  } as SocialOutboxJob;
  const edit = (change: Record<string, unknown>) => normalizePendingUpdate(job, { id: job.id, expectedRevision: 2, ...change }, now);

  it("merges the changed payload fields over the stored ones and checks the result like a new job", () => {
    expect(edit({ payload: { text: " Corrected " } })).toEqual({
      id: job.id,
      expectedRevision: 2,
      provider: "whatsapp",
      payload: { text: "Corrected", articleUrl: "https://atlasnews.example/en/articles/a", recipient: "15551234567" },
      availableAt: job.availableAt,
      maxAttempts: 5,
    });
    expect(() => edit({ payload: { articleUrl: "http://localhost/a" } })).toThrow("public HTTPS URL");
    expect(() => edit({ payload: { recipient: "12" } })).toThrow("E.164");
  });

  it("keeps the stored send time, sets a new one, or sends as soon as possible for null", () => {
    expect(edit({ maxAttempts: 4 }).availableAt).toBe(job.availableAt);
    expect(edit({ scheduledFor: "2026-10-13T10:30:00+02:00" }).availableAt).toBe("2026-10-13T08:30:00.000Z");
    expect(edit({ scheduledFor: null }).availableAt).toBe(now.toISOString());
    expect(() => edit({ scheduledFor: "tomorrow-ish" })).toThrow("Invalid scheduled date.");
  });

  it("asks for at least one change, and keeps the attempt limit above the attempts already made", () => {
    expect(() => edit({})).toThrow("Nothing to change");
    expect(() => edit({ payload: {} })).toThrow("Nothing to change");
    expect(() => edit({ payload: { text: undefined } })).toThrow("Nothing to change");
    expect(() => edit({ maxAttempts: 1 })).toThrow("more than the 1 attempts already made");
    expect(edit({ maxAttempts: 2 }).maxAttempts).toBe(2);
    expect(() => edit({ maxAttempts: 11 })).toThrow("between 1 and 10");
  });

  it("checks the job id and the revision it was read at", () => {
    expect(() => normalizePendingUpdate(job, { id: "nope", expectedRevision: 2, maxAttempts: 4 }, now)).toThrow("must be a UUID");
    expect(() => normalizePendingUpdate(job, { id: job.id, expectedRevision: -1, maxAttempts: 4 }, now)).toThrow("non-negative integer");
  });
});
