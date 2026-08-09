import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getSupabaseEnvironment: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/config/env", () => ({
  getSupabaseEnvironment: mocks.getSupabaseEnvironment,
}));

import { proxy } from "./proxy";

describe("proxy authentication refresh", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.getSupabaseEnvironment.mockReset();
    mocks.getSupabaseEnvironment.mockReturnValue({
      url: "https://example.supabase.co",
      anonKey: "test-anon-key",
    });
    mocks.createServerClient.mockReset();
    mocks.createServerClient.mockReturnValue({
      auth: { getClaims: mocks.getClaims },
    });
  });

  it("verifies auth-sensitive requests with getClaims", async () => {
    const response = await proxy(new NextRequest("https://neura.test/en/studio"));

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).toHaveBeenCalledOnce();
    expect(mocks.getClaims).toHaveBeenCalledOnce();
  });

  it("does not swallow a claims verification failure", async () => {
    mocks.getClaims.mockRejectedValueOnce(new Error("claims verification unavailable"));

    await expect(
      proxy(new NextRequest("https://neura.test/en/studio")),
    ).rejects.toThrow("claims verification unavailable");
  });

  it("keeps public routes free from Supabase auth work", async () => {
    const response = await proxy(new NextRequest("https://neura.test/en/latest"));

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});
