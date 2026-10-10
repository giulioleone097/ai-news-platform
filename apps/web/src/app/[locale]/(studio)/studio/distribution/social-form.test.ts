import { describe, expect, it } from "vitest";
import {
  parseSocialComposerForm,
  parseSocialQueueMutationForm,
} from "./social-form";

function composerForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const fields = {
    intent: "preview",
    locale: "en",
    publicationId: "019c55e5-254e-7c5f-aea7-cfa519cd3283",
    provider: "linkedin",
    text: "A verified social briefing.",
    recipient: "",
    scheduledFor: "2026-08-11T09:30",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

describe("social distribution Studio form", () => {
  it("accepts a preview without treating it as enqueue confirmation", () => {
    const result = parseSocialComposerForm(composerForm());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.confirm).toBe(false);
  });

  it("requires an explicit WhatsApp recipient", () => {
    const result = parseSocialComposerForm(composerForm({ provider: "whatsapp" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.recipient).toBeTruthy();
  });

  it("accepts E.164 only for WhatsApp", () => {
    const result = parseSocialComposerForm(composerForm({
      provider: "whatsapp",
      recipient: "+15551234567",
    }));
    expect(result.success).toBe(true);
  });

  it("rejects invalid UTC input before it reaches the outbox", () => {
    const result = parseSocialComposerForm(composerForm({ scheduledFor: "2026-02-31T09:30" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.scheduledFor).toBeTruthy();
  });

  it("requires a server-readable confirmation for queue mutations", () => {
    const unconfirmed = new FormData();
    unconfirmed.set("id", "019c55e5-254e-7c5f-aea7-cfa519cd3283");
    unconfirmed.set("locale", "en");
    expect(parseSocialQueueMutationForm(unconfirmed).success).toBe(false);

    unconfirmed.set("confirm", "true");
    expect(parseSocialQueueMutationForm(unconfirmed).success).toBe(true);
  });

  it("requires the exact recoverable job version for corrected requeue", () => {
    const missingVersion = parseSocialComposerForm(composerForm({ intent: "requeue" }));
    expect(missingVersion.success).toBe(false);

    const corrected = parseSocialComposerForm(composerForm({
      intent: "requeue",
      jobId: "fc7c6331-56a3-42dc-8932-6b4394bc4c9f",
      expectedRevision: "3",
    }));
    expect(corrected.success).toBe(true);
  });
});
