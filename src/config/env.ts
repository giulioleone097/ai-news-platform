const requiredSupabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function hasSupabaseEnvironment() {
  return requiredSupabaseKeys.every((key) => Boolean(process.env[key]?.trim()));
}

export function isDemoStudioEnabled() {
  return process.env.NODE_ENV !== "production"
    || process.env.NEURA_ENABLE_DEMO_STUDIO?.trim() === "true";
}

export function isStudioAvailable() {
  return hasSupabaseEnvironment() || isDemoStudioEnabled();
}

export function getPublicSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return new URL(value || "http://localhost:3000");
}

export function getSupabaseEnvironment() {
  if (!hasSupabaseEnvironment()) {
    return null;
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
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
