import { describe, expect, it, vi } from "vitest";
import { ResendCommentNotificationProvider } from "./resend-comment-notification-provider";

describe("ResendCommentNotificationProvider", () => {
  it("sends a scanner-safe confirmation link with a stable idempotency key", async () => {
    let capturedInit: RequestInit | undefined;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      capturedInit = init;
      return Response.json({ id: "resend-message-1" });
    });
    const provider = new ResendCommentNotificationProvider({
      apiKey: "re_test_key_123456789",
      baseUrl: new URL("https://news.example.com"),
      guestSecret: "g".repeat(40),
      fromEmail: "community@news.example.com",
      replyTo: "editor@news.example.com",
      endpoint: "https://resend.invalid/emails",
      fetch: request,
    });

    const result = await provider.send({
      id: "d4f99c40-35dd-48af-b06c-513d0b77aee1",
      subscriptionId: "4a72e86b-c7bc-48da-85a5-279736b82990",
      commentId: "a71fabf1-2a75-4d08-8b5c-241b48b591b2",
      kind: "verification",
      recipientEmail: "reader@example.com",
      locale: "en",
      payload: { articleSlug: "ai-agents-enter-everyday-work" },
      attempts: 1,
    });

    expect(result).toEqual({ messageId: "resend-message-1" });
    const body = JSON.parse(String(capturedInit?.body)) as { html: string; to: string[] };
    expect(body.to).toEqual(["reader@example.com"]);
    expect(body.html).toContain("/en/comments/notifications/verify?token=");
    expect(body.html).toContain("/en/comments/notifications/unsubscribe?token=");
    expect(capturedInit?.headers).toMatchObject({
      "Idempotency-Key": "comment-notification:d4f99c40-35dd-48af-b06c-513d0b77aee1",
    });
  });
});
