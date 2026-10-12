import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";

// The Studio and its sign-in, the API (comment, newsletter and capability endpoints) and the OAuth pages.
const privatePaths = [
  "/en/studio",
  "/it/studio",
  "/en/login",
  "/it/login",
  "/en/auth",
  "/it/auth",
  "/api/",
  "/oauth/",
];

// Crawlers that train models or answer questions for people; each may read the public site.
const aiAgents = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      ...aiAgents.map((userAgent) => ({ userAgent, allow: "/", disallow: privatePaths })),
    ],
    sitemap: [
      new URL("/sitemap.xml", base).toString(),
      new URL("/news-sitemap.xml", base).toString(),
    ],
  };
}
