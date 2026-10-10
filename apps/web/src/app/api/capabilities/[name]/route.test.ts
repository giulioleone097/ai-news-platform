import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("@/server/capabilities", () => ({ runEditorCapability: mocks.run }));

import { DELETE, GET, PATCH, POST, PUT } from "./route";

const url = "https://news.example.com/api/capabilities/admin_delete_entity";
const context = { params: Promise.resolve({ name: "admin_delete_entity" }) };

function call(init: { headers?: Record<string, string>; body?: BodyInit | null } = {}) {
  const { headers, body = JSON.stringify({ input: { slug: "x" }, confirmed: true }) } = init;
  return POST(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://news.example.com", ...headers },
      body,
    }),
    context,
  );
}

beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue({ ok: true, result: { deletedSlug: "x" } });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
});

describe("POST /api/capabilities/{name}", () => {
  it("runs the capability and answers uncached JSON", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toEqual({ ok: true, result: { deletedSlug: "x" } });
    expect(mocks.run).toHaveBeenCalledWith("admin_delete_entity", { slug: "x" }, { confirmed: true });
  });

  it("treats anything but a literal true as not confirmed", async () => {
    await call({ body: JSON.stringify({ input: {} }) });
    expect(mocks.run).toHaveBeenLastCalledWith("admin_delete_entity", {}, { confirmed: false });
    expect((await call({ body: JSON.stringify({ input: {}, confirmed: "true" }) })).status).toBe(400);
  });

  describe("same-origin only", () => {
    it("accepts the site origin, and a missing Origin that the browser marks same-origin", async () => {
      expect((await call({ headers: { "sec-fetch-site": "same-origin" } })).status).toBe(200);
      const noOrigin = new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: "{}",
      });
      expect((await POST(noOrigin, context)).status).toBe(200);
    });

    it("refuses a cross-site Origin before running anything", async () => {
      const response = await call({ headers: { origin: "https://evil.example" } });
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.run).not.toHaveBeenCalled();
    });

    it("refuses a request without Origin that the browser marks cross-site", async () => {
      const request = new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
        body: "{}",
      });
      expect((await POST(request, context)).status).toBe(403);
      expect(mocks.run).not.toHaveBeenCalled();
    });

    it("refuses a cross-site Sec-Fetch-Site even with a matching Origin, and a missing Origin without proof", async () => {
      expect((await call({ headers: { "sec-fetch-site": "same-site" } })).status).toBe(403);
      const noOrigin = new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect((await POST(noOrigin, context)).status).toBe(403);
      expect(mocks.run).not.toHaveBeenCalled();
    });
  });

  it("requires a JSON content type", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      expect((await call({ headers: { "content-type": type } })).status).toBe(415);
    }
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("bounds the body, declared or streamed", async () => {
    const big = JSON.stringify({ input: { text: "a".repeat(3 * 1024 * 1024) } });
    expect((await call({ body: big })).status).toBe(413);
    expect((await call({ body: big, headers: { "content-length": "10" } })).status).toBe(413);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects bodies that are not a JSON object", async () => {
    for (const body of ["", "not json", "[]", "null", '"text"']) {
      expect((await call({ body })).status).toBe(400);
    }
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("maps every failure of the runner to its status", async () => {
    for (const status of [400, 401, 403, 404, 409, 503] as const) {
      mocks.run.mockResolvedValueOnce({ ok: false, status, error: `E${status}` });
      const response = await call();
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ ok: false, error: `E${status}` });
    }
  });

  it("answers 405 to every other method", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
