const requiredSupabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function hasSupabaseEnvironment() {
  return requiredSupabaseKeys.every((key) => Boolean(process.env[key]?.trim()));
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
