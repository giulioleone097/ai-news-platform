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

function emailValue(name: string) {
  const value = serverValue(name);
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export type ContentMode = "demo" | "supabase";

export function hasSupabaseEnvironment() {
  return Boolean(parseHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL))
    && requiredSupabaseKeys.every((key) => Boolean(process.env[key]?.trim()));
}

export function getContentMode(): ContentMode {
  const configured = process.env.NEURA_CONTENT_MODE?.trim().toLowerCase();
  if (configured === "demo" || configured === "supabase") return configured;
  return hasSupabaseEnvironment() ? "supabase" : "demo";
}

export function isDemoStudioEnabled() {
  return process.env.NODE_ENV !== "production"
    || process.env.NEURA_ENABLE_DEMO_STUDIO?.trim() === "true";
}

export function isStudioAvailable() {
  return getContentMode() === "supabase"
    ? hasSupabaseEnvironment()
    : isDemoStudioEnabled();
}

export function getPublicSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return parseHttpUrl(value || (vercelHost ? `https://${vercelHost}` : undefined))
    ?? new URL("http://localhost:3000");
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
  const value = process.env.NEURA_MCP_ADMIN_API_KEY?.trim();
  return value && value.length >= 32 ? value : null;
}

export function getSupabaseAdminEnvironment() {
  const environment = getSupabaseServiceEnvironment();
  const authorId = process.env.NEURA_MCP_ADMIN_AUTHOR_ID?.trim();

  if (!environment || !authorId) return null;
  return { ...environment, authorId };
}

export function getSupabaseServiceEnvironment() {
  const environment = getSupabaseEnvironment();
  const serviceRoleKey = serverValue("SUPABASE_SERVICE_ROLE_KEY", 32);
  if (!environment || !serviceRoleKey) return null;
  return { ...environment, serviceRoleKey };
}

export function getCronSecret() {
  return serverValue("CRON_SECRET", 16);
}

export function getCommentEnvironment() {
  const guestSecret = serverValue("NEURA_COMMENT_GUEST_SECRET", 32);
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
    adminMcp: Boolean(getMcpAdminApiKey() && getSupabaseAdminEnvironment()),
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
