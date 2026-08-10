import { describe, expect, it, vi } from "vitest";
import { NewsletterDeliveryProviderError } from "./domain";
import { ResendNewsletterProvider } from "./resend-provider";

describe("ResendNewsletterProvider", () => {
  it("sends one recipient with idempotency and RFC one-click headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = new ResendNewsletterProvider({ apiKey: "re_test", fetch: fetchMock });
    await expect(provider.send({
      fromName: "NEURA",
      fromEmail: "briefing@example.com",
      to: "reader@example.com",
      replyTo: "editor@example.com",
      subject: "AI briefing",
      html: "<p>Briefing</p>",
      idempotencyKey: "newsletter:campaign:recipient",
      unsubscribeUrl: "https://example.com/unsubscribe/token",
    })).resolves.toEqual({ messageId: "email_123" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("newsletter:campaign:recipient");
    const payload = JSON.parse(String(init?.body));
    expect(payload.to).toEqual(["reader@example.com"]);
    expect(payload.headers).toEqual({
      "List-Unsubscribe": "<https://example.com/unsubscribe/token>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("classifies rate limits as retryable without real network access", async () => {
    const provider = new ResendNewsletterProvider({
      apiKey: "re_test",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: "rate limited" }), {
          status: 429,
          headers: { "Retry-After": "90" },
        }),
      ),
    });
    const error = await provider.sendConfirmation({
      fromEmail: "briefing@example.com",
      to: "reader@example.com",
      subject: "Confirm",
      html: "<p>Confirm</p>",
      replyTo: null,
      idempotencyKey: "newsletter-confirm:test",
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(NewsletterDeliveryProviderError);
    expect(error).toMatchObject({ retryable: true, retryAfterSeconds: 90 });
  });
});
