import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getContentMode,
  getProductionReadiness,
  isDemoStudioEnabled,
  isStudioAvailable,
} from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

function disableSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
}

describe("Studio environment boundary", () => {
  it("keeps the zero-config Studio available during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEURA_ENABLE_DEMO_STUDIO", "");
    vi.stubEnv("NEURA_CONTENT_MODE", "demo");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(true);
    expect(isStudioAvailable()).toBe(true);
  });

  it("fails closed in production without Supabase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEURA_ENABLE_DEMO_STUDIO", "");
    vi.stubEnv("NEURA_CONTENT_MODE", "demo");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(false);
    expect(isStudioAvailable()).toBe(false);
  });

  it("requires an exact production opt-in for the demo Studio", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEURA_ENABLE_DEMO_STUDIO", "true");
    vi.stubEnv("NEURA_CONTENT_MODE", "demo");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(true);
    expect(isStudioAvailable()).toBe(true);
  });

  it("keeps an explicit Supabase mode fail-closed when credentials are incomplete", () => {
    vi.stubEnv("NEURA_CONTENT_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(getContentMode()).toBe("supabase");
    expect(isStudioAvailable()).toBe(false);
  });

  it("reports a non-persistent localhost production as not ready", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEURA_CONTENT_MODE", "demo");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    disableSupabase();

    expect(getProductionReadiness()).toMatchObject({
      ready: false,
      mode: "demo",
      issues: expect.arrayContaining([
        "persistent-content-mode",
        "canonical-https-origin",
        "canonical-production-origin",
      ]),
    });
  });

  it("rejects malformed and insecure Supabase production origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEURA_CONTENT_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");

    expect(isStudioAvailable()).toBe(false);
    expect(getProductionReadiness().issues).toContain("supabase-environment");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://db.example.com");
    expect(isStudioAvailable()).toBe(true);
    expect(getProductionReadiness()).toMatchObject({
      ready: false,
      issues: expect.arrayContaining(["supabase-production-origin"]),
    });
  });
});
