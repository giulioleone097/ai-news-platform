import { oauthProviderIds, type OAuthCredentials, type OAuthProviderId } from "../auth/oauth";
import { getSitesBindings } from "../sites/bindings";
import { getClientAddressHeader } from "./client-address";
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

/**
 * Where content and every other record lives. `sites` is the default deployment: ChatGPT Sites with its
 * D1 database and R2 bucket, editors signed in with ChatGPT. `supabase` is the self-hosted alternative
 * (Postgres, Storage and Auth). `demo` is in-memory seed data for development and CI.
 */
export type ContentMode = "demo" | "sites" | "supabase";
const contentModes: readonly ContentMode[] = ["demo", "sites", "supabase"];

export function hasSupabaseEnvironment() {
  return Boolean(parseHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL))
    && requiredSupabaseKeys.every((key) => Boolean(process.env[key]?.trim()));
}

export function getContentMode(): ContentMode {
  const configured = process.env.ATLASNEWS_CONTENT_MODE?.trim().toLowerCase();
  if (contentModes.includes(configured as ContentMode)) return configured as ContentMode;
  if (getSitesBindings()) return "sites";
  return hasSupabaseEnvironment() ? "supabase" : "demo";
}

/**
 * Whether the `oai-authenticated-*` headers of ChatGPT Sites identify people (`sites` mode only; the
 * callers check the mode). On unless `ATLASNEWS_CHATGPT_SIGN_IN` is `off`: the owner's switch to ignore
 * them everywhere (Studio, `/mcp`) should the platform not replace the copies a
 * client sends. `readSitesIdentity` is the one reader.
 */
export function isChatGptSignInEnabled() {
  const configured = process.env.ATLASNEWS_CHATGPT_SIGN_IN?.trim().toLowerCase();
  return !(configured && ["off", "false", "0", "no"].includes(configured));
}

/**
 * Whether the server can write records that outlive the process: the Sites D1 binding, or Supabase with
 * the service-role key. Comments, newsletter delivery, the outboxes and MCP Events need it.
 */
export function hasServerStore() {
  return getContentMode() === "sites"
    ? Boolean(getSitesBindings())
    : Boolean(getSupabaseServiceEnvironment());
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
  const mode = getContentMode();
  if (mode === "sites") return Boolean(getSitesBindings());
  return mode === "supabase"
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

/**
 * Browser origins that may call the MCP route: `MCP_ALLOWED_ORIGINS` when it is set, otherwise the site's
 * own origin and the two hosts that run the supported clients. A caller that is not a browser (a server,
 * a CLI) sends no `Origin` and needs no entry.
 */
export function getAllowedMcpOrigins() {
  return listValue("MCP_ALLOWED_ORIGINS")
    ?? [...new Set([getPublicSiteUrl().origin, "https://chatgpt.com", "https://claude.ai"])];
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

/** Token for OpenAI's domain verification, served as plain text; one line of printable ASCII without spaces. */
export function getOpenAiAppsChallenge() {
  const value = process.env.ATLASNEWS_OPENAI_APPS_CHALLENGE?.trim();
  return value && /^[\x21-\x7E]{8,256}$/.test(value) ? value : null;
}

/**
 * Dedicated origin of the hosted UI (`_meta.ui.domain`), which OpenAI requires for plugins that ship UI.
 * Only the canonical https origin is accepted: no path, query, fragment, userinfo or port.
 */
export function getMcpUiDomain() {
  const value = process.env.ATLASNEWS_MCP_UI_DOMAIN?.trim().replace(/\/$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The Supabase project and the public MCP origin that turn MCP sign-in on; null when either is missing, and
 * on Sites, where the platform is the authorization server. Without `NEXT_PUBLIC_MCP_URL` the resource URL
 * in the sign-in challenge and in the (publicly cached) resource metadata would come from the request's
 * Host header, which a caller chooses, so sign-in stays off rather than trust it.
 */
function mcpOAuthProject() {
  if (getContentMode() === "sites") return null;
  const service = getSupabaseServiceEnvironment();
  return service && getConfiguredMcpUrl() ? service : null;
}

/**
 * Supabase Auth as the OAuth authorization server for the MCP endpoint. Present only when the project
 * URL, the service-role key (used to read the editor's profile), the public origin of the MCP server and
 * `ATLASNEWS_MCP_OAUTH_CLIENT_IDS` are configured. Without the client list sign-in stays off (fail
 * closed): the access token carries Supabase's generic `authenticated` audience, so the OAuth client is
 * the only thing that binds a token to this server, and with dynamic registration open anyone can register
 * a client and ask an editor to approve it. `getProductionReadiness` names the missing list.
 */
export function getMcpOAuthEnvironment() {
  const service = mcpOAuthProject();
  const clientIds = listValue("ATLASNEWS_MCP_OAUTH_CLIENT_IDS");
  if (!service || !clientIds) return null;

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
    /** OAuth client ids whose tokens are accepted: the pre-registered clients of the hosts in use. */
    clientIds,
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
    perPrincipal: positiveInteger("ATLASNEWS_MCP_EVENTS_MAX_PER_PRINCIPAL"),
    perHost: positiveInteger("ATLASNEWS_MCP_EVENTS_MAX_PER_HOST"),
    perDomain: positiveInteger("ATLASNEWS_MCP_EVENTS_MAX_PER_DOMAIN"),
    total: positiveInteger("ATLASNEWS_MCP_EVENTS_MAX_SUBSCRIPTIONS"),
  };
}

/** Accepted `events/subscribe` calls per minute for one signed-in caller. */
export function getMcpEventsSubscribeRate() {
  return positiveInteger("ATLASNEWS_MCP_EVENTS_SUBSCRIBES_PER_MINUTE") ?? 30;
}

export function getCronSecret() {
  return serverValue("CRON_SECRET", 16);
}

/**
 * Own Google and GitHub sign-in (`sites` and `demo`): a provider is on only when its client id and secret
 * are both set, and none works without the secret that signs the session cookies. Null when nothing is on.
 */
export function getOAuthSignInEnvironment() {
  const sessionSecret = serverValue("ATLASNEWS_SESSION_SECRET", 32);
  if (!sessionSecret) return null;
  const credentials = (prefix: "GOOGLE" | "GITHUB"): OAuthCredentials | null => {
    const clientId = serverValue(`${prefix}_CLIENT_ID`);
    const clientSecret = serverValue(`${prefix}_CLIENT_SECRET`);
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  };
  const providers: Partial<Record<OAuthProviderId, OAuthCredentials>> = {};
  const google = credentials("GOOGLE");
  const github = credentials("GITHUB");
  if (google) providers.google = google;
  if (github) providers.github = github;
  return google || github ? { sessionSecret, providers } : null;
}

/**
 * The providers people can sign in with here: in `supabase` mode those the operator listed in
 * `ATLASNEWS_SUPABASE_OAUTH_PROVIDERS` (enabled in the Supabase dashboard, which holds their credentials),
 * otherwise those with own credentials.
 */
export function getSignInProviders(): OAuthProviderId[] {
  if (getContentMode() === "supabase") {
    if (!hasSupabaseEnvironment()) return [];
    const listed = (listValue("ATLASNEWS_SUPABASE_OAUTH_PROVIDERS") ?? []).map((item) => item.toLowerCase());
    return oauthProviderIds.filter((id) => listed.includes(id));
  }
  const own = getOAuthSignInEnvironment();
  return own ? oauthProviderIds.filter((id) => id in own.providers) : [];
}

export function getCommentEnvironment() {
  const guestSecret = serverValue("ATLASNEWS_COMMENT_GUEST_SECRET", 32);
  return guestSecret && hasServerStore() ? { guestSecret } : null;
}

export function getNewsletterDeliveryEnvironment() {
  const store = hasServerStore();
  const apiKey = serverValue("RESEND_API_KEY", 8);
  const webhookSecret = serverValue("RESEND_WEBHOOK_SECRET", 16);
  const unsubscribeSecret = serverValue("NEWSLETTER_UNSUBSCRIBE_SECRET", 32);
  const from = emailValue("NEWSLETTER_FROM_EMAIL");
  const replyTo = process.env.NEWSLETTER_REPLY_TO?.trim()
    ? emailValue("NEWSLETTER_REPLY_TO")
    : null;

  if (!store || !apiKey?.startsWith("re_") || !webhookSecret?.startsWith("whsec_")
    || !unsubscribeSecret || !from || (process.env.NEWSLETTER_REPLY_TO?.trim() && !replyTo)) {
    return null;
  }
  return { apiKey, webhookSecret, unsubscribeSecret, from, replyTo };
}

export function getCommentNotificationEnvironment() {
  const comments = getCommentEnvironment();
  const delivery = getNewsletterDeliveryEnvironment();
  return comments && delivery
    ? { ...comments, apiKey: delivery.apiKey, from: delivery.from, replyTo: delivery.replyTo }
    : null;
}

export function getSocialPublishingEnvironment() {
  const store = hasServerStore();
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

  return { store, linkedin, x, whatsapp };
}

export function getOperationalCapabilities() {
  const social = getSocialPublishingEnvironment();
  const sites = getContentMode() === "sites" && Boolean(getSitesBindings());
  return {
    comments: Boolean(getCommentEnvironment()),
    commentNotifications: Boolean(getCommentNotificationEnvironment()),
    newsletterDelivery: Boolean(getNewsletterDeliveryEnvironment()),
    linkedinPublishing: Boolean(social.store && social.linkedin),
    xPublishing: Boolean(social.store && social.x),
    whatsappPublishing: Boolean(social.store && social.whatsapp),
    // On Sites the Worker runs due jobs itself after requests; elsewhere an external schedule calls them.
    scheduler: sites || Boolean(getCronSecret()),
    // On Sites the platform signs editors in to the MCP server and forwards their identity.
    adminMcp: sites || Boolean(getMcpOAuthEnvironment() || (getMcpAdminApiKey() && getSupabaseAdminEnvironment())),
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

/** Origin of the MCP server that the reader site links to: the site itself on Sites, else the standalone server. */
export function getPublicMcpUrl() {
  return parseHttpUrl(process.env.NEXT_PUBLIC_MCP_URL)
    ?? (getContentMode() === "sites" ? getPublicSiteUrl() : new URL("http://localhost:8787"));
}

export function getSocialProfiles() {
  return {
    linkedin: optionalWebUrl(process.env.NEXT_PUBLIC_LINKEDIN_URL),
    x: optionalWebUrl(process.env.NEXT_PUBLIC_X_URL),
  };
}

/**
 * `issues` block readiness (the health route answers 503); `warnings` name a protection that is weaker than
 * it should be while the site still works, so they do not.
 */
export function getProductionReadiness() {
  const mode = getContentMode();
  const siteUrl = getPublicSiteUrl();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const supabaseUrl = parseHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const issues: string[] = [];
  const warnings: string[] = [];
  const capabilities = getOperationalCapabilities();
  if (mode === "supabase" && !hasSupabaseEnvironment()) issues.push("supabase-environment");
  if (mode === "sites" && !getSitesBindings()) issues.push("sites-bindings");
  if (process.env.NODE_ENV === "production") {
    if (mode === "demo") issues.push("persistent-content-mode");
    if (configuredSiteUrl && !parseHttpUrl(configuredSiteUrl)) issues.push("canonical-valid-origin");
    if (siteUrl.protocol !== "https:") issues.push("canonical-https-origin");
    if (isLocalHostname(siteUrl.hostname)) issues.push("canonical-production-origin");
    if (mode === "supabase" && supabaseUrl && !isSecureProductionOrigin(supabaseUrl)) {
      issues.push("supabase-production-origin");
    }
    for (const [capability, configured] of Object.entries(capabilities)) {
      if (!configured) issues.push(`capability-${capability}`);
    }
    // The per-network limits of comments and newsletter requests bind only behind the one header the edge sets.
    if (mode === "sites" && !getClientAddressHeader()) warnings.push("client-address-header");
    // Why sign-in is off although its Supabase variables are set, when nothing else covers admin MCP.
    if (!capabilities.adminMcp && mcpOAuthProject() && !getMcpOAuthEnvironment()) issues.push("mcp-oauth-client-ids");
  }
  return { ready: issues.length === 0, mode, siteUrl, capabilities, issues, warnings };
}
