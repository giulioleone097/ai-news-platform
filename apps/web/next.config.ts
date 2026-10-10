import type { NextConfig } from "next";
import {
  isSecureProductionOrigin,
  parseHttpUrl,
} from "@atlasnews/adapters/config/url-policy";

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const parsedSupabaseUrl = parseHttpUrl(configuredSupabaseUrl);
const siteUrl = parseHttpUrl(configuredSiteUrl);
const hostedSite = siteUrl !== null && isSecureProductionOrigin(siteUrl);
const hostedSupabase = parsedSupabaseUrl !== null && isSecureProductionOrigin(parsedSupabaseUrl);

// A production build aimed at a public origin or a hosted Supabase project must be complete: real
// content, a hosted HTTPS Supabase project and a public HTTPS canonical origin, never demo data or
// localhost metadata. Demo builds (CI, local review) and local-Supabase builds are unaffected, and
// /api/health stays the runtime check that the deployed environment is ready.
if (process.env.NODE_ENV === "production" && (hostedSite || hostedSupabase)) {
  if (process.env.NEURA_CONTENT_MODE?.trim() !== "supabase") {
    throw new Error("Public builds require NEURA_CONTENT_MODE=supabase.");
  }
  if (!parsedSupabaseUrl || !configuredSupabaseKey) {
    throw new Error("Public builds require a valid Supabase URL and public key.");
  }
  if (!hostedSupabase) {
    throw new Error("Public builds require a non-local HTTPS Supabase origin.");
  }
  if (!hostedSite) {
    throw new Error("Public builds require a non-local HTTPS canonical origin.");
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
  transpilePackages: ["@atlasnews/core", "@atlasnews/contract", "@atlasnews/adapters"],
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    inlineCss: true,
    globalNotFound: true,
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
