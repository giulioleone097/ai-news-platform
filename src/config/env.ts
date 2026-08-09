import {
  isLocalHostname,
  isSecureProductionOrigin,
  parseHttpUrl,
} from "./url-policy";

const requiredSupabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

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
  const environment = getSupabaseEnvironment();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const authorId = process.env.NEURA_MCP_ADMIN_AUTHOR_ID?.trim();

  if (!environment || !serviceRoleKey || !authorId) return null;
  return { ...environment, serviceRoleKey, authorId };
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
  if (mode === "supabase" && !hasSupabaseEnvironment()) issues.push("supabase-environment");
  if (process.env.NODE_ENV === "production") {
    if (mode !== "supabase") issues.push("persistent-content-mode");
    if (configuredSiteUrl && !parseHttpUrl(configuredSiteUrl)) issues.push("canonical-valid-origin");
    if (siteUrl.protocol !== "https:") issues.push("canonical-https-origin");
    if (isLocalHostname(siteUrl.hostname)) issues.push("canonical-production-origin");
    if (mode === "supabase" && supabaseUrl && !isSecureProductionOrigin(supabaseUrl)) {
      issues.push("supabase-production-origin");
    }
  }
  return { ready: issues.length === 0, mode, siteUrl, issues };
}
