import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getContentMode,
  getOperationalCapabilities,
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

  it("reports real outbound capabilities only when every secret is complete", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEURA_CONTENT_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(40));
    vi.stubEnv("NEURA_MCP_ADMIN_AUTHOR_ID", "9f25cab8-80d6-4f34-b7d0-6dad0524a860");
    vi.stubEnv("NEURA_MCP_ADMIN_API_KEY", "m".repeat(40));
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    vi.stubEnv("NEURA_COMMENT_GUEST_SECRET", "g".repeat(40));
    vi.stubEnv("RESEND_API_KEY", `re_${"a".repeat(24)}`);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${"w".repeat(24)}`);
    vi.stubEnv("NEWSLETTER_FROM_EMAIL", "briefing@news.example.com");
    vi.stubEnv("NEWSLETTER_REPLY_TO", "editor@news.example.com");
    vi.stubEnv("NEWSLETTER_UNSUBSCRIBE_SECRET", "u".repeat(40));
    vi.stubEnv("LINKEDIN_ACCESS_TOKEN", "l".repeat(32));
    vi.stubEnv("LINKEDIN_AUTHOR_URN", "urn:li:organization:123456");
    vi.stubEnv("LINKEDIN_API_VERSION", "202604");
    vi.stubEnv("X_USER_ACCESS_TOKEN", "x".repeat(32));
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "a".repeat(32));
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("WHATSAPP_API_VERSION", "v24.0");
    vi.stubEnv("WHATSAPP_WEBHOOK_SECRET", "h".repeat(32));
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "v".repeat(32));

    expect(getOperationalCapabilities()).toEqual({
      comments: true,
      commentNotifications: true,
      newsletterDelivery: true,
      linkedinPublishing: true,
      xPublishing: true,
      whatsappPublishing: true,
      scheduler: true,
      adminMcp: true,
    });
    expect(getProductionReadiness()).toMatchObject({ ready: true, issues: [] });

    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect(getOperationalCapabilities().newsletterDelivery).toBe(false);
    expect(getOperationalCapabilities().commentNotifications).toBe(false);
    expect(getProductionReadiness().issues).toContain("capability-newsletterDelivery");
    expect(getProductionReadiness().issues).toContain("capability-commentNotifications");
  });
});
