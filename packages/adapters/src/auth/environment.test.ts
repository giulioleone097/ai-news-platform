import { afterEach, describe, expect, it, vi } from "vitest";
import { getOAuthSignInEnvironment, getSignInProviders } from "../config/env";

const secret = "a-session-secret-that-is-at-least-32-chars";

function configure(values: Record<string, string>) {
  for (const name of [
    "ATLASNEWS_SESSION_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "ATLASNEWS_SUPABASE_OAUTH_PROVIDERS",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]) {
    vi.stubEnv(name, values[name] ?? "");
  }
  vi.stubEnv("ATLASNEWS_CONTENT_MODE", values.ATLASNEWS_CONTENT_MODE ?? "demo");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("own sign-in configuration", () => {
  it("turns a provider on only with its id and secret and the session secret", () => {
    configure({ GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" });
    expect(getOAuthSignInEnvironment()).toBeNull();
    expect(getSignInProviders()).toEqual([]);

    configure({ ATLASNEWS_SESSION_SECRET: secret, GOOGLE_CLIENT_ID: "g-id" });
    expect(getSignInProviders()).toEqual([]);

    configure({ ATLASNEWS_SESSION_SECRET: secret, GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" });
    expect(getOAuthSignInEnvironment()).toEqual({
      sessionSecret: secret,
      providers: { google: { clientId: "g-id", clientSecret: "g-secret" } },
    });
    expect(getSignInProviders()).toEqual(["google"]);

    configure({
      ATLASNEWS_SESSION_SECRET: secret,
      GOOGLE_CLIENT_ID: "g-id",
      GOOGLE_CLIENT_SECRET: "g-secret",
      GITHUB_CLIENT_ID: "h-id",
      GITHUB_CLIENT_SECRET: "h-secret",
    });
    expect(getSignInProviders()).toEqual(["google", "github"]);
  });

  it("rejects a session secret shorter than 32 characters", () => {
    configure({ ATLASNEWS_SESSION_SECRET: "too-short", GITHUB_CLIENT_ID: "h-id", GITHUB_CLIENT_SECRET: "h-secret" });
    expect(getOAuthSignInEnvironment()).toBeNull();
  });

  it("leaves the providers of Supabase mode to the operator's list, not to own credentials", () => {
    const supabase = {
      ATLASNEWS_CONTENT_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
    configure({ ...supabase, ATLASNEWS_SESSION_SECRET: secret, GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" });
    expect(getSignInProviders()).toEqual([]);

    configure({ ...supabase, ATLASNEWS_SUPABASE_OAUTH_PROVIDERS: "GitHub, google, facebook" });
    expect(getSignInProviders()).toEqual(["google", "github"]);
  });
});
