import type { NextConfig } from "next";
import {
  isSecureProductionOrigin,
  parseHttpUrl,
} from "./src/config/url-policy";

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const parsedSupabaseUrl = parseHttpUrl(configuredSupabaseUrl);

if (process.env.VERCEL === "1") {
  if (process.env.NEURA_CONTENT_MODE?.trim() !== "supabase") {
    throw new Error("Vercel builds require NEURA_CONTENT_MODE=supabase.");
  }
  if (!parsedSupabaseUrl || !configuredSupabaseKey) {
    throw new Error("Vercel builds require a valid Supabase URL and public key.");
  }
  if (!isSecureProductionOrigin(parsedSupabaseUrl)) {
    throw new Error("Vercel builds require a non-local HTTPS Supabase origin.");
  }
  const siteUrl = parseHttpUrl(configuredSiteUrl);
  if (!siteUrl || !isSecureProductionOrigin(siteUrl)) {
    throw new Error("Vercel builds require a non-local HTTPS canonical origin.");
  }
}

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
if (parsedSupabaseUrl) {
  remotePatterns.push({
    protocol: parsedSupabaseUrl.protocol === "http:" ? "http" : "https",
    hostname: parsedSupabaseUrl.hostname,
    port: parsedSupabaseUrl.port,
    pathname: "/storage/v1/object/public/editorial-media/**",
  });
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
  images: {
    formats: ["image/webp"],
    minimumCacheTTL: 31_536_000,
    qualities: [70, 75, 88],
    remotePatterns,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
