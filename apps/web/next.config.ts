import type { NextConfig } from "next";
import {
  isSecureProductionOrigin,
  parseHttpUrl,
} from "@atlasnews/adapters/config/url-policy";
import { locales } from "@atlasnews/core/locale";

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const parsedSupabaseUrl = parseHttpUrl(configuredSupabaseUrl);
const siteUrl = parseHttpUrl(configuredSiteUrl);
const hostedSite = siteUrl !== null && isSecureProductionOrigin(siteUrl);
const hostedSupabase = parsedSupabaseUrl !== null && isSecureProductionOrigin(parsedSupabaseUrl);

// A production build aimed at a public origin or a hosted Supabase project must be complete: persistent
// content (ChatGPT Sites' D1, or a hosted Supabase project) and a public HTTPS canonical origin, never
// demo data or localhost metadata. The Sites build defaults the mode to `sites` (vite.config.ts). Demo
// builds (CI, local review) and local-Supabase builds are unaffected, and /api/health stays the runtime
// check that the deployed environment is ready.
const contentMode = process.env.ATLASNEWS_CONTENT_MODE?.trim();
if (process.env.NODE_ENV === "production" && (hostedSite || hostedSupabase)) {
  if (contentMode !== "sites" && contentMode !== "supabase") {
    throw new Error("Public builds require ATLASNEWS_CONTENT_MODE=sites or ATLASNEWS_CONTENT_MODE=supabase.");
  }
  if (contentMode === "supabase") {
    if (!parsedSupabaseUrl || !configuredSupabaseKey) {
      throw new Error("Public builds require a valid Supabase URL and public key.");
    }
    if (!hostedSupabase) {
      throw new Error("Public builds require a non-local HTTPS Supabase origin.");
    }
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

// What the site really loads: its own scripts, styles (inline too: the pages carry theirs), fonts and media; the
// Supabase project's images and API when one is configured; and the two embed frames the reader clicks to load.
// Next and vinext write inline scripts for the page's data and bootstrap, hence 'unsafe-inline'; nonces would
// replace it in an enforced policy. Report-only and without a reporting endpoint: a violation shows in the
// browser console and nothing is blocked. Enforce it once the console stays clean.
const supabaseOrigin = parsedSupabaseUrl ? ` ${parsedSupabaseUrl.origin}` : "";
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseOrigin}`,
  "font-src 'self'",
  `connect-src 'self'${supabaseOrigin}`,
  "frame-src 'self' https://www.youtube-nocookie.com https://platform.twitter.com",
].join("; ");

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
  // Both builds read this: `next build` and the vinext Sites build (measured on the artifact in workerd).
  // Do not give two rules the same header for one path: Next lets the later rule win, vinext the first.
  // The sensitive routes therefore only add a header the general rule lacks (Content-Security-Policy, where the
  // general rule has only the Report-Only one); src/proxy.ts, which both builds also run, upgrades their
  // X-Frame-Options to DENY.
  async headers() {
    const localePattern = locales.join("|");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      // Pages where one click approves something (OAuth consent) or changes the newsroom (Studio, its
      // sign-in) must never be framed, not even by this site. frame-ancestors is what current browsers
      // enforce.
      ...[
        "/oauth/:path*",
        `/:locale(${localePattern})/studio/:path*`,
        `/:locale(${localePattern})/login`,
        `/:locale(${localePattern})/auth/:path*`,
      ].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      })),
    ];
  },
};

export default nextConfig;
