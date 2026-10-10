import {
  isLocalHostname,
  isSecureProductionOrigin,
  parseHttpUrl,
} from "./url-policy";

const requiredSupabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function serverValue(name: string, minimumLength = 1) {
  const value = process.env[name]?.trim();
  return value && value.length >= minimumLength ? value : null;
}

/** A comma-separated list, or null when the variable is unset or empty. */
function listValue(name: string) {
  const items = (process.env[name] ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : null;
}

function emailValue(name: string) {
  const value = serverValue(name);
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function positiveInteger(name: string) {
  const value = Number(process.env[name]?.trim());
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export type ContentMode = "demo" | "supabase";

export function hasSupabaseEnvironment() {
  return Boolean(parseHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL))
    && requiredSupabaseKeys.every((key) => Boolean(process.env[key]?.trim()));
}

export function getContentMode(): ContentMode {
  const configured = process.env.ATLASNEWS_CONTENT_MODE?.trim().toLowerCase();
  if (configured === "demo" || configured === "supabase") return configured;
  return hasSupabaseEnvironment() ? "supabase" : "demo";
}

/**
 * The demo Studio signs in everyone as an admin on in-memory data. It exists only where the runtime says
 * it is a development or test run, or when the operator opts in; a runtime that does not set NODE_ENV
 * (a bare Worker or container) must not get it.
 */
export function isDemoStudioEnabled() {
  const runtime = process.env.NODE_ENV;
  return runtime === "development" || runtime === "test"
    || process.env.ATLASNEWS_ENABLE_DEMO_STUDIO?.trim() === "true";
}

export function isStudioAvailable() {
  return getContentMode() === "supabase"
    ? hasSupabaseEnvironment()
    : isDemoStudioEnabled();
}

export function getPublicSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return parseHttpUrl(value) ?? new URL("http://localhost:3000");
}

export function getSupabaseEnvironment() {
  if (!hasSupabaseEnvironment()) {
    return null;
  }

  return {
    url: parseHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)!.toString(),
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

export function getAllowedMcpOrigins() {
  return (process.env.MCP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getMcpAdminApiKey() {
  const value = process.env.ATLASNEWS_MCP_ADMIN_API_KEY?.trim();
  return value && value.length >= 32 ? value : null;
}

/**
 * Service-role access acting as one author. A signed-in editor passes their own `author_id`;
 * the shared API key falls back to `ATLASNEWS_MCP_ADMIN_AUTHOR_ID`.
 */
export function getSupabaseAdminEnvironment(actorAuthorId?: string) {
  const environment = getSupabaseServiceEnvironment();
  const authorId = actorAuthorId?.trim() || process.env.ATLASNEWS_MCP_ADMIN_AUTHOR_ID?.trim();

  if (!environment || !authorId) return null;
  return { ...environment, authorId };
}

/** Scopes that Supabase Auth can grant. It has no custom scopes, so newsroom permissions come from the profile role. */
const supabaseOAuthScopes = ["email"] as const;

/** Origin of the MCP server as hosts reach it, when configured; behind a proxy the request URL cannot be trusted. */
export function getConfiguredMcpUrl() {
  return parseHttpUrl(process.env.NEXT_PUBLIC_MCP_URL);
}

/**
 * Supabase Auth as the OAuth authorization server for the MCP endpoint. Present only when the
 * project URL, the service-role key (used to read the editor's profile) and the public origin of the
 * MCP server are configured. Without `NEXT_PUBLIC_MCP_URL` the resource URL in the sign-in challenge
 * and in the (publicly cached) resource metadata would come from the request's Host header, which a
 * caller chooses, so sign-in stays off rather than trust it.
 */
export function getMcpOAuthEnvironment() {
  const service = getSupabaseServiceEnvironment();
  if (!service || !getConfiguredMcpUrl()) return null;

  const base = new URL(service.url);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const configuredIssuer = parseHttpUrl(process.env.ATLASNEWS_MCP_OAUTH_ISSUER);
  const issuer = (configuredIssuer ?? new URL("auth/v1", base)).toString().replace(/\/+$/, "");
  const audience = serverValue("ATLASNEWS_MCP_OAUTH_AUDIENCE");

  return {
    issuer,
    jwksUrl: new URL(`${issuer}/.well-known/jwks.json`),
    /** Required `aud`; null accepts Supabase's own `authenticated` audience. */
    audience,
    /**
     * OAuth client ids whose tokens are accepted; null accepts any client of this project, which is what
     * dynamic client registration needs and is not recommended in production.
     */
    clientIds: listValue("ATLASNEWS_MCP_OAUTH_CLIENT_IDS"),
    scopes: supabaseOAuthScopes as readonly string[],
    profiles: { url: service.url, serviceRoleKey: service.serviceRoleKey },
  };
}

/**
 * Hosts an OAuth client may send the editor back to once they approve it: exact hostnames, or `*.host`
 * for any subdomain. The default covers the hosts that run the supported clients and loopback for
 * local ones; `ATLASNEWS_OAUTH_REDIRECT_HOSTS` replaces it.
 */
export function getOAuthRedirectHosts() {
  return listValue("ATLASNEWS_OAUTH_REDIRECT_HOSTS")
    ?? ["claude.ai", "claude.com", "chatgpt.com", "localhost", "127.0.0.1", "[::1]"];
}

export function getSupabaseServiceEnvironment() {
  const environment = getSupabaseEnvironment();
  const serviceRoleKey = serverValue("SUPABASE_SERVICE_ROLE_KEY", 32);
  if (!environment || !serviceRoleKey) return null;
  return { ...environment, serviceRoleKey };
}

/**
 * Operator overrides for the MCP Events abuse limits; an unset or invalid value keeps the default
 * that the events service defines.
 */
export function getMcpEventsLimits() {
  return {
    perHost: positiveInteger("ATLASNEWS_MCP_EVENTS_MAX_PER_HOST"),
    perDomain: positiveInteger("ATLASNEWS_MCP_EVENTS_MAX_PER_DOMAIN"),
    total: positiveInteger("ATLASNEWS_MCP_EVENTS_MAX_SUBSCRIPTIONS"),
  };
}

/** Accepted `events/subscribe` calls per minute for one client network (all clients, when no client address header is trusted). */
export function getMcpEventsSubscribeRate() {
  return positiveInteger("ATLASNEWS_MCP_EVENTS_SUBSCRIBES_PER_MINUTE") ?? 30;
}

export function getCronSecret() {
  return serverValue("CRON_SECRET", 16);
}

export function getCommentEnvironment() {
  const guestSecret = serverValue("ATLASNEWS_COMMENT_GUEST_SECRET", 32);
  const service = getSupabaseServiceEnvironment();
  return guestSecret && service ? { ...service, guestSecret } : null;
}

export function getNewsletterDeliveryEnvironment() {
  const service = getSupabaseServiceEnvironment();
  const apiKey = serverValue("RESEND_API_KEY", 8);
  const webhookSecret = serverValue("RESEND_WEBHOOK_SECRET", 16);
  const unsubscribeSecret = serverValue("NEWSLETTER_UNSUBSCRIBE_SECRET", 32);
  const from = emailValue("NEWSLETTER_FROM_EMAIL");
  const replyTo = process.env.NEWSLETTER_REPLY_TO?.trim()
    ? emailValue("NEWSLETTER_REPLY_TO")
    : null;

  if (!service || !apiKey?.startsWith("re_") || !webhookSecret?.startsWith("whsec_")
    || !unsubscribeSecret || !from || (process.env.NEWSLETTER_REPLY_TO?.trim() && !replyTo)) {
    return null;
  }
  return { ...service, apiKey, webhookSecret, unsubscribeSecret, from, replyTo };
}

export function getCommentNotificationEnvironment() {
  const comments = getCommentEnvironment();
  const delivery = getNewsletterDeliveryEnvironment();
  return comments && delivery
    ? { ...comments, apiKey: delivery.apiKey, from: delivery.from, replyTo: delivery.replyTo }
    : null;
}

export function getSocialPublishingEnvironment() {
  const service = getSupabaseServiceEnvironment();
  const linkedInToken = serverValue("LINKEDIN_ACCESS_TOKEN", 16);
  const linkedInAuthor = serverValue("LINKEDIN_AUTHOR_URN");
  const linkedInVersion = serverValue("LINKEDIN_API_VERSION", 6);
  const xToken = serverValue("X_USER_ACCESS_TOKEN", 16);
  const whatsappToken = serverValue("WHATSAPP_ACCESS_TOKEN", 16);
  const whatsappPhoneNumberId = serverValue("WHATSAPP_PHONE_NUMBER_ID");
  const whatsappVersion = serverValue("WHATSAPP_API_VERSION");
  const whatsappWebhookSecret = serverValue("WHATSAPP_WEBHOOK_SECRET", 16);
  const whatsappVerifyToken = serverValue("WHATSAPP_VERIFY_TOKEN", 16);

  const linkedin = linkedInToken
    && linkedInAuthor && /^urn:li:(?:organization|person):\d+$/.test(linkedInAuthor)
    && linkedInVersion && /^\d{6}$/.test(linkedInVersion)
    ? { accessToken: linkedInToken, authorUrn: linkedInAuthor, apiVersion: linkedInVersion }
    : null;
  const x = xToken ? { accessToken: xToken } : null;
  const whatsapp = whatsappToken
    && whatsappPhoneNumberId && /^\d+$/.test(whatsappPhoneNumberId)
    && whatsappVersion && /^v\d{1,2}\.\d+$/.test(whatsappVersion)
    && whatsappWebhookSecret && whatsappVerifyToken
    ? {
        accessToken: whatsappToken,
        phoneNumberId: whatsappPhoneNumberId,
        apiVersion: whatsappVersion,
        webhookSecret: whatsappWebhookSecret,
        verifyToken: whatsappVerifyToken,
      }
    : null;

  return { service, linkedin, x, whatsapp };
}

export function getOperationalCapabilities() {
  const social = getSocialPublishingEnvironment();
  return {
    comments: Boolean(getCommentEnvironment()),
    commentNotifications: Boolean(getCommentNotificationEnvironment()),
    newsletterDelivery: Boolean(getNewsletterDeliveryEnvironment()),
    linkedinPublishing: Boolean(social.service && social.linkedin),
    xPublishing: Boolean(social.service && social.x),
    whatsappPublishing: Boolean(social.service && social.whatsapp),
    scheduler: Boolean(getCronSecret()),
    adminMcp: Boolean(getMcpOAuthEnvironment() || (getMcpAdminApiKey() && getSupabaseAdminEnvironment())),
  };
}

function optionalWebUrl(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Origin of the standalone MCP server that the reader site links to. */
export function getPublicMcpUrl() {
  return parseHttpUrl(process.env.NEXT_PUBLIC_MCP_URL) ?? new URL("http://localhost:8787");
}

export function getSocialProfiles() {
  return {
    linkedin: optionalWebUrl(process.env.NEXT_PUBLIC_LINKEDIN_URL),
    x: optionalWebUrl(process.env.NEXT_PUBLIC_X_URL),
  };
}

export function getProductionReadiness() {
  const mode = getContentMode();
  const siteUrl = getPublicSiteUrl();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const supabaseUrl = parseHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const issues: string[] = [];
  const capabilities = getOperationalCapabilities();
  if (mode === "supabase" && !hasSupabaseEnvironment()) issues.push("supabase-environment");
  if (process.env.NODE_ENV === "production") {
    if (mode !== "supabase") issues.push("persistent-content-mode");
    if (configuredSiteUrl && !parseHttpUrl(configuredSiteUrl)) issues.push("canonical-valid-origin");
    if (siteUrl.protocol !== "https:") issues.push("canonical-https-origin");
    if (isLocalHostname(siteUrl.hostname)) issues.push("canonical-production-origin");
    if (mode === "supabase" && supabaseUrl && !isSecureProductionOrigin(supabaseUrl)) {
      issues.push("supabase-production-origin");
    }
    for (const [capability, configured] of Object.entries(capabilities)) {
      if (!configured) issues.push(`capability-${capability}`);
    }
  }
  return { ready: issues.length === 0, mode, siteUrl, capabilities, issues };
}
