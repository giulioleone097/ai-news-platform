import { afterEach, describe, expect, it, vi } from "vitest";

import { isDemoStudioEnabled, isStudioAvailable } from "./env";

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
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(true);
    expect(isStudioAvailable()).toBe(true);
  });

  it("fails closed in production without Supabase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEURA_ENABLE_DEMO_STUDIO", "");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(false);
    expect(isStudioAvailable()).toBe(false);
  });

  it("requires an exact production opt-in for the demo Studio", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEURA_ENABLE_DEMO_STUDIO", "true");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(true);
    expect(isStudioAvailable()).toBe(true);
  });
});
