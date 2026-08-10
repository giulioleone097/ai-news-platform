import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeCronRequest } from "./cron-auth";

afterEach(() => vi.unstubAllEnvs());

describe("authorizeCronRequest", () => {
  it("fails closed when the deployment has no cron secret", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(authorizeCronRequest(new Request("https://news.example.com/api/internal")))
      .toEqual({ ok: false, status: 503 });
  });

  it("accepts only the exact Vercel bearer credential", () => {
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    const authorized = new Request("https://news.example.com/api/internal", {
      headers: { authorization: `Bearer ${"c".repeat(32)}` },
    });
    const rejected = new Request("https://news.example.com/api/internal", {
      headers: { authorization: `Bearer ${"c".repeat(31)}x` },
    });

    expect(authorizeCronRequest(authorized)).toEqual({ ok: true });
    expect(authorizeCronRequest(rejected)).toEqual({ ok: false, status: 401 });
  });
});
