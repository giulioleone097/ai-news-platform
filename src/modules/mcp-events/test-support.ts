import type { PublishedArticle } from "./domain/events";
import type { PublishedArticleSource, WebhookClient, WebhookRequest, WebhookResponse } from "./domain/ports";

/** 24-byte key (Standard Webhooks documentation secret). */
export const testSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
export const otherSecret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
export const callbackUrl = "https://receiver.example.com/mcp-events/callback_123";

/** Records every request and answers through `respond` (default: echo the verification challenge). */
export class FakeWebhookClient implements WebhookClient {
  readonly requests: WebhookRequest[] = [];
  respond: (request: WebhookRequest) => WebhookResponse | Promise<WebhookResponse> = (request) => {
    const body = JSON.parse(request.body) as { type?: string; challenge?: string };
    return body.type === "verification"
      ? { status: 200, body: JSON.stringify({ challenge: body.challenge }) }
      : { status: 200, body: "" };
  };

  async post(request: WebhookRequest) {
    this.requests.push(request);
    return this.respond(request);
  }
}

export function article(overrides: Partial<PublishedArticle> = {}): PublishedArticle {
  return {
    id: "article-1",
    slug: "model-ships",
    locale: "en",
    title: "A model ships",
    excerpt: "Short summary.",
    categorySlug: "models",
    categoryName: "Models",
    publishedAt: "2026-10-10T12:00:00.000Z",
    ...overrides,
  };
}

export class FakeArticleSource implements PublishedArticleSource {
  articles: PublishedArticle[] = [];

  async listPublishedAfter(locale: string, after: Date) {
    return this.articles
      .filter((item) => item.locale === locale && Date.parse(item.publishedAt) > after.getTime())
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }
}
