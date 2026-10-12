import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AtlasNews",
    short_name: "AtlasNews",
    description: "Artificial intelligence, without the noise.",
    // The root sends each visit to the language its browser prefers (src/proxy.ts), so the installed app opens in it.
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en",
  };
}
