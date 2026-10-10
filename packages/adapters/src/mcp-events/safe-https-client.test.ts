import { EventEmitter } from "node:events";
import type https from "node:https";
import { describe, expect, it, vi } from "vitest";

import { WebhookTransportError } from "@atlasnews/core/mcp-events/domain/errors";
import { SafeHttpsWebhookClient, type AddressResolver } from "./safe-https-client";

type RequestOptions = https.RequestOptions & {
  lookup: (host: string, options: object, callback: (...args: unknown[]) => void) => void;
};

function fakeTransport(respond: "ok" | "hang" | "redirect" = "ok") {
  const calls: { options: RequestOptions; written: Buffer[] }[] = [];
  const request = ((options: RequestOptions, onResponse: (response: EventEmitter) => void) => {
    const written: Buffer[] = [];
    calls.push({ options, written });
    const emitter = new EventEmitter() as EventEmitter & {
      end: (chunk: Buffer) => void;
      destroy: (error: Error) => void;
    };
    emitter.end = (chunk) => {
      written.push(chunk);
      if (respond === "hang") return;
      const response = Object.assign(new EventEmitter(), {
        statusCode: respond === "redirect" ? 302 : 200,
        destroy: vi.fn(),
      });
      onResponse(response);
      response.emit("data", Buffer.from('{"challenge":"abc"}'));
      response.emit("end");
    };
    emitter.destroy = (error) => emitter.emit("error", error);
    return emitter;
  }) as unknown as typeof https.request;
  return { request, calls };
}

const publicResolver: AddressResolver = async () => [{ address: "93.184.216.34", family: 4 }];
const input = (url: string, overrides = {}) => ({
  url,
  headers: { "Content-Type": "application/json", "webhook-id": "evt_1" },
  body: '{"a":1}',
  timeoutMs: 1000,
  ...overrides,
});

describe("SafeHttpsWebhookClient", () => {
  it("connects to the validated address while keeping the hostname", async () => {
    const transport = fakeTransport();
    const client = new SafeHttpsWebhookClient(publicResolver, transport.request);

    const response = await client.post(input("https://receiver.example.com:8443/hook?x=1"));

    expect(response).toEqual({ status: 200, body: '{"challenge":"abc"}' });
    const { options, written } = transport.calls[0];
    expect(options).toMatchObject({
      protocol: "https:",
      hostname: "receiver.example.com",
      port: "8443",
      path: "/hook?x=1",
      method: "POST",
      agent: false,
    });
    expect(options.headers).toMatchObject({ "Content-Length": "7", "webhook-id": "evt_1" });
    expect(written[0].toString()).toBe('{"a":1}');

    const single = vi.fn();
    options.lookup("receiver.example.com", {}, single);
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const all = vi.fn();
    options.lookup("receiver.example.com", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("rejects hosts resolving to private addresses without connecting", async () => {
    const transport = fakeTransport();
    const resolver: AddressResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];
    const client = new SafeHttpsWebhookClient(resolver, transport.request);

    await expect(client.post(input("https://rebind.example.com/hook")))
      .rejects.toMatchObject({ reason: "blocked_address" });
    expect(transport.calls).toHaveLength(0);
  });

  it.each([
    "https://127.0.0.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://[::ffff:10.0.0.1]/hook",
  ])("rejects IP literal %s even though DNS is never consulted", async (url) => {
    const transport = fakeTransport();
    const resolver = vi.fn(publicResolver);
    const client = new SafeHttpsWebhookClient(resolver, transport.request);

    await expect(client.post(input(url))).rejects.toMatchObject({ reason: "blocked_address" });
    expect(resolver).not.toHaveBeenCalled();
    expect(transport.calls).toHaveLength(0);
  });

  it("rejects non-HTTPS URLs, credentials and oversized bodies", async () => {
    const transport = fakeTransport();
    const client = new SafeHttpsWebhookClient(publicResolver, transport.request);

    await expect(client.post(input("http://receiver.example.com/hook"))).rejects.toMatchObject({ reason: "invalid_url" });
    await expect(client.post(input("https://user:pw@receiver.example.com/hook"))).rejects.toMatchObject({ reason: "invalid_url" });
    await expect(client.post(input("not a url"))).rejects.toMatchObject({ reason: "invalid_url" });
    await expect(client.post(input("https://receiver.example.com/hook", { body: "x".repeat(256 * 1024 + 1) })))
      .rejects.toMatchObject({ reason: "payload_too_large" });
    expect(transport.calls).toHaveLength(0);
  });

  it("reports unresolved hosts as network failures", async () => {
    const client = new SafeHttpsWebhookClient(async () => { throw new Error("ENOTFOUND"); }, fakeTransport().request);
    await expect(client.post(input("https://nowhere.example.com/hook"))).rejects.toMatchObject({ reason: "network" });
  });

  it("returns redirects as responses and never follows them", async () => {
    const transport = fakeTransport("redirect");
    const client = new SafeHttpsWebhookClient(publicResolver, transport.request);
    await expect(client.post(input("https://receiver.example.com/hook"))).resolves.toMatchObject({ status: 302 });
    expect(transport.calls).toHaveLength(1);
  });

  it("times out hanging requests", async () => {
    const transport = fakeTransport("hang");
    const client = new SafeHttpsWebhookClient(publicResolver, transport.request);
    const failure = await client.post(input("https://receiver.example.com/hook", { timeoutMs: 10 }))
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(WebhookTransportError);
    expect(failure).toMatchObject({ reason: "timeout" });
  });
});
