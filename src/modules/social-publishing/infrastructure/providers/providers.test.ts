import { describe, expect, it } from "vitest";

import { SocialProviderError, SocialPublishingConfigurationError } from "../../domain/errors";
import { LinkedInPostsAdapter } from "./linkedin";
import { WhatsAppCloudAdapter } from "./whatsapp";
import { XPostsAdapter } from "./x";

function recordingFetch(response: () => Response) {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return response();
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

describe("real social provider adapters", () => {
  it("creates a LinkedIn Posts API request and reads x-restli-id", async () => {
    const transport = recordingFetch(() => new Response(null, {
      status: 201,
      headers: { "x-restli-id": "urn:li:share:6844785523593134080" },
    }));
    const adapter = new LinkedInPostsAdapter({
      accessToken: "linkedin-user-access-token-123456",
      authorUrn: "urn:li:organization:5515715",
      apiVersion: "202606",
      fetch: transport.fetch,
    });

    await expect(adapter.publish({
      text: "A production AI briefing",
      articleUrl: "https://neura.example/en/articles/briefing",
    }, { idempotencyKey: "social:linkedin:publication-123" })).resolves.toEqual({
      messageId: "urn:li:share:6844785523593134080",
      url: "https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080/",
      status: "published",
    });

    expect(transport.calls).toHaveLength(1);
    expect(String(transport.calls[0].input)).toBe("https://api.linkedin.com/rest/posts");
    expect(transport.calls[0].init?.redirect).toBe("error");
    expect(transport.calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer linkedin-user-access-token-123456",
      "Linkedin-Version": "202606",
      "X-Restli-Protocol-Version": "2.0.0",
    });
    expect(JSON.parse(String(transport.calls[0].init?.body))).toMatchObject({
      author: "urn:li:organization:5515715",
      commentary: "A production AI briefing\n\nhttps://neura.example/en/articles/briefing",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
      distribution: { feedDistribution: "MAIN_FEED" },
    });
  });

  it("creates an X API v2 post and returns its canonical URL", async () => {
    const transport = recordingFetch(() => Response.json({
      data: { id: "1445880548472328192", text: "AI briefing" },
    }, { status: 201 }));
    const adapter = new XPostsAdapter({
      accessToken: "x-user-context-access-token-123456",
      fetch: transport.fetch,
    });

    await expect(adapter.publish({ text: "AI briefing" }, {
      idempotencyKey: "social:x:publication-123",
    })).resolves.toEqual({
      messageId: "1445880548472328192",
      url: "https://x.com/i/web/status/1445880548472328192",
      status: "published",
    });
    expect(String(transport.calls[0].input)).toBe("https://api.x.com/2/tweets");
    expect(JSON.parse(String(transport.calls[0].init?.body))).toEqual({ text: "AI briefing" });
  });

  it("sends a WhatsApp Cloud API direct message only to the explicit job recipient", async () => {
    const transport = recordingFetch(() => Response.json({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.HBgMNTU1MTIzNDU2NzgVAgARGBI5" }],
    }));
    const adapter = new WhatsAppCloudAdapter({
      accessToken: "whatsapp-system-user-token-123456",
      phoneNumberId: "106540352242922",
      apiVersion: "v23.0",
      fetch: transport.fetch,
    });

    await expect(adapter.publish({
      text: "Your requested AI briefing",
      recipient: "+15551234567",
    }, { idempotencyKey: "social:whatsapp:publication-123" })).resolves.toEqual({
      messageId: "wamid.HBgMNTU1MTIzNDU2NzgVAgARGBI5",
      url: null,
      status: "accepted",
    });
    expect(String(transport.calls[0].input)).toBe(
      "https://graph.facebook.com/v23.0/106540352242922/messages",
    );
    const body = JSON.parse(String(transport.calls[0].init?.body));
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      biz_opaque_callback_data: "social:whatsapp:publication-123",
    });
  });

  it("never defaults a WhatsApp recipient", () => {
    const adapter = new WhatsAppCloudAdapter({
      accessToken: "whatsapp-system-user-token-123456",
      phoneNumberId: "106540352242922",
      apiVersion: "v23.0",
      fetch: recordingFetch(() => Response.json({})).fetch,
    });
    expect(() => adapter.validate({ text: "No target" })).toThrow("Invalid WhatsApp message");
  });

  it("fails closed on partial provider configuration", () => {
    expect(() => new LinkedInPostsAdapter({
      accessToken: "too-short",
      authorUrn: "urn:li:organization:5515715",
      apiVersion: "202606",
    })).toThrow(SocialPublishingConfigurationError);
  });

  it("redacts provider errors and retries only an explicit 429 rejection", async () => {
    const token = "x-user-context-access-token-123456";
    const transport = recordingFetch(() => Response.json({
      error: { code: "rate_limit", message: `Bearer ${token} phone +15551234567` },
    }, { status: 429, headers: { "retry-after": "90" } }));
    const adapter = new XPostsAdapter({ accessToken: token, fetch: transport.fetch });

    const error = await adapter.publish({ text: "AI briefing" }, {
      idempotencyKey: "social:x:publication-123",
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SocialProviderError);
    expect(error).toMatchObject({ retryable: true, outcomeUnknown: false, retryAfterSeconds: 90 });
    expect((error as Error).message).not.toContain(token);
    expect((error as Error).message).not.toContain("15551234567");
  });

  it("classifies transport loss as an unknown outcome and never retries automatically", async () => {
    const fetch = (async () => {
      throw new Error("socket closed after write");
    }) as typeof globalThis.fetch;
    const adapter = new XPostsAdapter({
      accessToken: "x-user-context-access-token-123456",
      fetch,
    });
    const error = await adapter.publish({ text: "AI briefing" }, {
      idempotencyKey: "social:x:publication-123",
    }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ retryable: false, outcomeUnknown: true });
  });
});
