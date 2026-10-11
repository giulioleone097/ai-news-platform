import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MemoryContactRepository } from "@atlasnews/adapters/support/memory-contact-repository";
import { ContactMessageService } from "@atlasnews/core/support/application/contact-service";
import { contactPolicy } from "@atlasnews/core/support/domain/contact-message";

const state = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/server/composition", () => ({ getContactMessageService: () => state.service }));

import { POST } from "./route";

const valid = {
  locale: "en",
  name: "Ada Lovelace",
  email: "ada@example.com",
  subject: "A correction",
  body: "The article names the wrong model in its second paragraph.",
  website: "",
};

function send(body: unknown, init: { origin?: string | null; contentType?: string; headers?: Record<string, string> } = {}) {
  const origin = init.origin === undefined ? "https://news.example.com" : init.origin;
  return POST(new NextRequest("https://news.example.com/api/contact", {
    method: "POST",
    headers: {
      "content-type": init.contentType ?? "application/json",
      ...(origin ? { origin } : {}),
      ...init.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

let repository: MemoryContactRepository;
let service: ContactMessageService;

beforeEach(() => {
  vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "x-client-ip");
  repository = new MemoryContactRepository();
  service = new ContactMessageService(repository);
  state.service = service;
});

describe("POST /api/contact", () => {
  it("stores a valid message and answers 202 without caching", async () => {
    const response = await send(valid);

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ accepted: true });
    expect((await service.list()).items).toMatchObject([{ name: "Ada Lovelace", status: "new", locale: "en" }]);
  });

  it("refuses a cross-origin or origin-less post before reading it", async () => {
    expect((await send(valid, { origin: "https://evil.example.com" })).status).toBe(403);
    expect((await send(valid, { origin: null })).status).toBe(403);
    expect((await service.list()).items).toEqual([]);
  });

  it("refuses a body that is not JSON, malformed or too large", async () => {
    expect((await send("name=Ada", { contentType: "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await send("{not json")).status).toBe(400);
    expect((await send({ ...valid, body: "x".repeat(30_000) })).status).toBe(413);
    expect((await service.list()).items).toEqual([]);
  });

  it("answers a filled honeypot as a success and stores nothing", async () => {
    const response = await send({ ...valid, website: "https://spam.example.com" });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect((await service.list()).items).toEqual([]);
  });

  it("names the invalid fields", async () => {
    const response = await send({ ...valid, email: "not-an-address", body: "short" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request", fields: expect.arrayContaining(["email", "body"]) });
    expect((await service.list()).items).toEqual([]);
  });

  it("limits one network and leaves the others alone", async () => {
    const from = (address: string) => send(valid, { headers: { "x-client-ip": address } });
    for (let index = 0; index < contactPolicy.requesterLimit; index += 1) {
      expect((await from("203.0.113.7")).status).toBe(202);
    }
    const limited = await from("203.0.113.7");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("600");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await from("203.0.113.8")).status).toBe(202);
    expect((await service.list({ limit: 50 })).items).toHaveLength(contactPolicy.requesterLimit + 1);
  });

  it("answers 503 when the inbox is not configured and 500 when storing fails", async () => {
    state.service = null;
    expect(await (await send(valid)).json()).toEqual({ error: "unavailable" });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.service = { submit: async () => { throw new Error("database down"); } };
    const failed = await send(valid);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "contact_failed" });
  });
});
