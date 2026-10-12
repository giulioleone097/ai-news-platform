import { afterEach, describe, expect, it, vi } from "vitest";

import { setSitesBindings } from "../sites/bindings";
import {
  getAllowedMcpOrigins,
  getConfiguredMcpUrl,
  getContentMode,
  getMcpOAuthEnvironment,
  getOperationalCapabilities,
  getProductionReadiness,
  isChatGptSignInEnabled,
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

describe("ChatGPT sign-in switch", () => {
  it("is on unless the owner turns it off", () => {
    for (const value of [undefined, "", "on", "true", "anything else"]) {
      vi.stubEnv("ATLASNEWS_CHATGPT_SIGN_IN", value);
      expect(isChatGptSignInEnabled(), String(value)).toBe(true);
    }
    for (const value of ["off", " OFF ", "false", "0", "no"]) {
      vi.stubEnv("ATLASNEWS_CHATGPT_SIGN_IN", value);
      expect(isChatGptSignInEnabled(), value).toBe(false);
    }
  });
});

describe("Studio environment boundary", () => {
  it("keeps the zero-config Studio available during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ATLASNEWS_ENABLE_DEMO_STUDIO", "");
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(true);
    expect(isStudioAvailable()).toBe(true);
  });

  it("fails closed in production without Supabase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ATLASNEWS_ENABLE_DEMO_STUDIO", "");
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(false);
    expect(isStudioAvailable()).toBe(false);
  });

  it("fails closed when the runtime sets no NODE_ENV at all", () => {
    vi.stubEnv("NODE_ENV", undefined);
    vi.stubEnv("ATLASNEWS_ENABLE_DEMO_STUDIO", "");
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(false);
    expect(isStudioAvailable()).toBe(false);
    for (const unknown of ["staging", "Production", ""]) {
      vi.stubEnv("NODE_ENV", unknown);
      expect(isDemoStudioEnabled(), unknown).toBe(false);
    }
  });

  it("requires an exact production opt-in for the demo Studio", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ATLASNEWS_ENABLE_DEMO_STUDIO", "true");
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
    disableSupabase();

    expect(isDemoStudioEnabled()).toBe(true);
    expect(isStudioAvailable()).toBe(true);
  });

  it("keeps an explicit Supabase mode fail-closed when credentials are incomplete", () => {
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(getContentMode()).toBe("supabase");
    expect(isStudioAvailable()).toBe(false);
  });

  it("reports a non-persistent localhost production as not ready", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "demo");
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
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "supabase");
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
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(40));
    vi.stubEnv("ATLASNEWS_MCP_ADMIN_AUTHOR_ID", "9f25cab8-80d6-4f34-b7d0-6dad0524a860");
    vi.stubEnv("ATLASNEWS_MCP_ADMIN_API_KEY", "m".repeat(40));
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    vi.stubEnv("ATLASNEWS_COMMENT_GUEST_SECRET", "g".repeat(40));
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

  it("warns on Sites, without failing readiness, while no client address header is configured", () => {
    setSitesBindings({ DB: {}, BUCKET: {} });
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ATLASNEWS_CONTENT_MODE", "sites");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
      vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "");
      const without = getProductionReadiness();
      expect(without.warnings).toEqual(["client-address-header"]);
      expect(without.issues).not.toContain("client-address-header");

      vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "cf-connecting-ip");
      const configured = getProductionReadiness();
      expect(configured.warnings).toEqual([]);
      // A warning never decides readiness.
      expect(configured.ready).toBe(without.ready);
      expect(configured.issues).toEqual(without.issues);

      vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "");
      vi.stubEnv("ATLASNEWS_CONTENT_MODE", "supabase");
      expect(getProductionReadiness().warnings).toEqual([]);
    } finally {
      setSitesBindings(null);
    }
  });

  it("allows this site, chatgpt.com and claude.ai to call MCP from a browser unless the operator lists origins", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com/");
    vi.stubEnv("MCP_ALLOWED_ORIGINS", "");
    expect(getAllowedMcpOrigins()).toEqual(["https://news.example.com", "https://chatgpt.com", "https://claude.ai"]);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://claude.ai");
    expect(getAllowedMcpOrigins()).toEqual(["https://claude.ai", "https://chatgpt.com"]);
    vi.stubEnv("MCP_ALLOWED_ORIGINS", " https://reader.example , ,https://other.example");
    expect(getAllowedMcpOrigins()).toEqual(["https://reader.example", "https://other.example"]);
  });

  it("derives the MCP sign-in server from the Supabase project and fails closed without the service key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(getMcpOAuthEnvironment()).toBeNull();

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(40));
    // The sign-in challenge names the server's own public origin; the Host header is not an input.
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "");
    expect(getMcpOAuthEnvironment()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "https://mcp.news.example.com");
    // Fail closed: the generic `authenticated` audience binds a token to no client, so a list is required.
    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "");
    expect(getMcpOAuthEnvironment()).toBeNull();
    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", " , ,");
    expect(getMcpOAuthEnvironment()).toBeNull();

    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "abc");
    expect(getMcpOAuthEnvironment()).toMatchObject({
      issuer: "https://project.supabase.co/auth/v1",
      clientIds: ["abc"],
      jwksUrl: new URL("https://project.supabase.co/auth/v1/.well-known/jwks.json"),
      audience: null,
      scopes: ["email"],
    });

    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", " abc ,def,, ");
    expect(getMcpOAuthEnvironment()?.clientIds).toEqual(["abc", "def"]);

    vi.stubEnv("ATLASNEWS_MCP_OAUTH_ISSUER", "https://auth.news.example.com/auth/v1/");
    vi.stubEnv("ATLASNEWS_MCP_OAUTH_AUDIENCE", "https://mcp.news.example.com/mcp");
    expect(getMcpOAuthEnvironment()).toMatchObject({
      issuer: "https://auth.news.example.com/auth/v1",
      audience: "https://mcp.news.example.com/mcp",
    });
  });

  it("names the missing client list when it is the reason admin MCP is not available", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ATLASNEWS_CONTENT_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(40));
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "https://mcp.news.example.com");
    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "");
    vi.stubEnv("ATLASNEWS_MCP_ADMIN_API_KEY", "");
    expect(getOperationalCapabilities().adminMcp).toBe(false);
    expect(getProductionReadiness().issues).toEqual(expect.arrayContaining(["capability-adminMcp", "mcp-oauth-client-ids"]));

    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "abc");
    expect(getOperationalCapabilities().adminMcp).toBe(true);
    expect(getProductionReadiness().issues).not.toContain("mcp-oauth-client-ids");

    // The API key covers admin MCP without sign-in, so a missing list is not a reason to fail.
    vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "");
    vi.stubEnv("ATLASNEWS_MCP_ADMIN_API_KEY", "m".repeat(40));
    vi.stubEnv("ATLASNEWS_MCP_ADMIN_AUTHOR_ID", "9f25cab8-80d6-4f34-b7d0-6dad0524a860");
    expect(getOperationalCapabilities().adminMcp).toBe(true);
    expect(getProductionReadiness().issues).not.toContain("mcp-oauth-client-ids");
  });

  it("offers no MCP sign-in on Sites, where the platform signs people in", () => {
    setSitesBindings({ DB: {}, BUCKET: {} });
    try {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(40));
      vi.stubEnv("NEXT_PUBLIC_MCP_URL", "https://mcp.news.example.com");
      vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "abc");
      vi.stubEnv("ATLASNEWS_CONTENT_MODE", "sites");
      expect(getMcpOAuthEnvironment()).toBeNull();
      vi.stubEnv("ATLASNEWS_CONTENT_MODE", "supabase");
      expect(getMcpOAuthEnvironment()).not.toBeNull();
    } finally {
      setSitesBindings(null);
    }
  });

  it("only trusts an explicitly configured public MCP URL", () => {
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "");
    expect(getConfiguredMcpUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_MCP_URL", "https://mcp.news.example.com");
    expect(getConfiguredMcpUrl()?.origin).toBe("https://mcp.news.example.com");
  });
});
