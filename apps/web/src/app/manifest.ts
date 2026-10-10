import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AtlasNews",
    short_name: "AtlasNews",
    description: "Artificial intelligence, without the noise.",
    start_url: "/en",
    display: "standalone",
    background_color: "#f4f1ec",
    theme_color: "#f4f1ec",
    lang: "en",
  };
}
