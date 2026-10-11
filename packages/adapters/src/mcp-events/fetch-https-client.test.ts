import { describe, expect, it, vi } from "vitest";

import { WebhookTransportError } from "@atlasnews/core/mcp-events/domain/errors";
import { FetchHttpsWebhookClient } from "./fetch-https-client";

const input = (url: string, overrides = {}) => ({
  url,
  headers: { "Content-Type": "application/json", "webhook-id": "evt_1" },
  body: '{"a":1}',
  timeoutMs: 1000,
  ...overrides,
});

const rejection = async (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);

function clientFor(respond: () => Response | Promise<Response>) {
  const fetcher = vi.fn<typeof fetch>(async () => respond());
  return { client: new FetchHttpsWebhookClient(fetcher), fetcher };
}

describe("FetchHttpsWebhookClient", () => {
  it("posts the exact body with the headers, no redirects and a timeout signal", async () => {
    const { client, fetcher } = clientFor(() => new Response('{"challenge":"abc"}', { status: 200 }));

    const response = await client.post(input("https://receiver.example.com:8443/hook?x=1"));

    expect(response).toEqual({ status: 200, body: '{"challenge":"abc"}' });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://receiver.example.com:8443/hook?x=1");
    expect(init).toMatchObject({
      method: "POST",
      body: '{"a":1}',
      redirect: "manual",
      headers: { "Content-Type": "application/json", "webhook-id": "evt_1" },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not follow redirects: a 3xx answer is returned as it is", async () => {
    const { client, fetcher } = clientFor(() => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/" } }));
    expect(await client.post(input("https://receiver.example.com/hook"))).toEqual({ status: 302, body: "" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an IPv4 literal", "https://93.184.216.34/hook"],
    ["loopback", "https://127.0.0.1/hook"],
    ["a private address", "https://10.0.0.5/hook"],
    ["link-local metadata", "https://169.254.169.254/latest"],
    ["a decimal IPv4 spelling", "https://2130706433/hook"],
    ["a hex IPv4 spelling", "https://0x7f.1/hook"],
    ["an IPv6 literal", "https://[2606:4700::1111]/hook"],
    ["IPv6 loopback", "https://[::1]/hook"],
    ["IPv4-mapped IPv6", "https://[::ffff:7f00:1]/hook"],
    ["localhost", "https://localhost/hook"],
    ["a localhost subdomain", "https://app.localhost/hook"],
    ["a .local name", "https://printer.local/hook"],
    ["a .internal name", "https://metadata.google.internal/hook"],
    ["a single-label name", "https://intranet/hook"],
  ])("blocks %s without sending anything", async (_label, url) => {
    const { client, fetcher } = clientFor(() => new Response("", { status: 200 }));
    expect(await rejection(client.post(input(url)))).toMatchObject({ name: "WebhookTransportError", reason: "blocked_address" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["http://receiver.example.com/hook"],
    ["https://user:secret@receiver.example.com/hook"],
    ["not a url"],
  ])("rejects %s as an invalid URL", async (url) => {
    const { client, fetcher } = clientFor(() => new Response("", { status: 200 }));
    expect(await rejection(client.post(input(url)))).toMatchObject({ reason: "invalid_url" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a body over 256 KiB", async () => {
    const { client, fetcher } = clientFor(() => new Response("", { status: 200 }));
    expect(await rejection(client.post(input("https://receiver.example.com/hook", { body: "x".repeat(256 * 1024 + 1) }))))
      .toMatchObject({ reason: "payload_too_large" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("caps the response body at 8 KiB", async () => {
    const { client } = clientFor(() => new Response("a".repeat(100 * 1024), { status: 200 }));
    const response = await client.post(input("https://receiver.example.com/hook"));
    expect(response.body).toBe("a".repeat(8 * 1024));
  });

  it("maps an expired timeout to a timeout failure", async () => {
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    const client = new FetchHttpsWebhookClient(fetcher as unknown as typeof fetch);

    const error = await rejection(client.post(input("https://receiver.example.com/hook", { timeoutMs: 20 })));

    expect(error).toBeInstanceOf(WebhookTransportError);
    expect(error).toMatchObject({ reason: "timeout" });
  });

  it("maps any other fetch failure to a network failure without leaking its message", async () => {
    const { client } = clientFor(() => { throw new TypeError("connect ECONNREFUSED 10.0.0.1"); });
    const error = await rejection(client.post(input("https://receiver.example.com/hook")));
    expect(error).toMatchObject({ reason: "network", message: "Webhook request failed." });
  });
});
