import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/config/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/en/studio/", "/it/studio/", "/en/auth/", "/it/auth/"],
      },
    ],
    sitemap: new URL("/sitemap.xml", getPublicSiteUrl()).toString(),
  };
}
