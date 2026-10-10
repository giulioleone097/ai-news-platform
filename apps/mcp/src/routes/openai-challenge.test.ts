import { afterEach, describe, expect, it, vi } from "vitest";

import { handleMcpServerRequest } from "../handler";

const path = "/.well-known/openai-apps-challenge";
const token = "a1b2c3d4e5f6g7h8";

function challenge(init?: RequestInit) {
  return handleMcpServerRequest(new Request(`http://mcp.news.example.com${path}`, init));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenAI domain verification route", () => {
  it("serves the configured token as plain text, never cached", async () => {
    vi.stubEnv("ATLASNEWS_OPENAI_APPS_CHALLENGE", token);

    const response = await challenge();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(token);
  });

  it("trims surrounding whitespace from the configured value", async () => {
    vi.stubEnv("ATLASNEWS_OPENAI_APPS_CHALLENGE", `  ${token}\n`);

    expect(await (await challenge()).text()).toBe(token);
  });

  it("answers 404 when the variable is unset or blank", async () => {
    for (const value of [undefined, "", "   "]) {
      vi.stubEnv("ATLASNEWS_OPENAI_APPS_CHALLENGE", value);

      const response = await challenge();

      expect(response.status, String(value)).toBe(404);
      expect(response.headers.get("Cache-Control"), String(value)).toBe("no-store");
    }
  });

  it("refuses values that are not one line of printable ASCII of 8 to 256 characters", async () => {
    const invalid = [
      "short",
      "a".repeat(257),
      "has space in it",
      `${token}\r\nSet-Cookie: x=1`,
      `${token}\nX-Injected: 1`,
      "tökenvalue123",
    ];
    for (const value of invalid) {
      vi.stubEnv("ATLASNEWS_OPENAI_APPS_CHALLENGE", value);

      const response = await challenge();

      expect(response.status, JSON.stringify(value)).toBe(404);
      expect(await response.text(), JSON.stringify(value)).not.toContain(value.trim());
    }
  });

  it("allows only GET and answers other methods with 405", async () => {
    vi.stubEnv("ATLASNEWS_OPENAI_APPS_CHALLENGE", token);

    const response = await challenge({ method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });
});
