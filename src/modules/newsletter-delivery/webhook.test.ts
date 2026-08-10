import { describe, expect, it } from "vitest";
import { parseResendWebhook } from "./webhook";

describe("Resend newsletter webhook", () => {
  it("retains the recipient transiently but persists only whitelisted operational fields", () => {
    const parsed = parseResendWebhook(JSON.stringify({
      type: "email.bounced",
      created_at: "2026-08-10T12:00:00.000Z",
      data: {
        email_id: "email_123",
        to: ["reader@example.com"],
        from: "briefing@example.com",
        subject: "Private subject",
      },
    }), "webhook_123");

    expect(parsed.recipientEmail).toBe("reader@example.com");
    expect(parsed.event.payload).toEqual({
      email_id: "email_123",
      event_type: "email.bounced",
      occurred_at: "2026-08-10T12:00:00.000Z",
    });
    expect(JSON.stringify(parsed.event.payload)).not.toContain("reader@example.com");
    expect(JSON.stringify(parsed.event.payload)).not.toContain("Private subject");
  });
});
