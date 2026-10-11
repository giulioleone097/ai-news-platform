import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";
import hosting from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

// Local stand-ins for the bindings that .openai/hosting.json declares. Sites replaces them with the real
// D1 database and R2 bucket when it deploys; locally Wrangler keeps them under .wrangler/state.
const localBindings = {
  d1_databases: hosting.d1
    ? [{ binding: hosting.d1, database_name: "atlasnews-local", database_id: "00000000-0000-4000-8000-000000000000" }]
    : [],
  r2_buckets: hosting.r2 ? [{ binding: hosting.r2, bucket_name: "atlasnews-local" }] : [],
};

// Local media that ship in pre-sized variants (/media/<name>-<width>.webp): { name: [widths ascending] }.
// build/sites-worker.ts sends /_next/image requests for them to the smallest variant that is wide enough.
function presizedMedia() {
  const directory = fileURLToPath(new URL("./public/media", import.meta.url));
  const variants: Record<string, number[]> = {};
  for (const file of existsSync(directory) ? readdirSync(directory) : []) {
    const match = /^([\w-]+)-(\d+)\.webp$/.exec(file);
    if (match) (variants[match[1]] ??= []).push(Number(match[2]));
  }
  for (const widths of Object.values(variants)) widths.sort((a, b) => a - b);
  return variants;
}

export default defineConfig(async () => {
  // Keep Wrangler offline and out of the user's profile while building.
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  // This build is the ChatGPT Sites artifact: content lives in its D1 database unless told otherwise.
  // next.config.ts reads the mode for its production guard.
  process.env.ATLASNEWS_CONTENT_MODE ??= "sites";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    define: { __PRESIZED_MEDIA__: JSON.stringify(presizedMedia()) },
    plugins: [
      vinext(),
      // OpenAI's Sites integration: copies .openai/hosting.json and the D1 migrations (drizzle/) to
      // dist/.openai, and simulates Sign in with ChatGPT on loopback in `vite dev`.
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: { main: "./build/sites-worker.ts", compatibility_flags: ["nodejs_compat"], ...localBindings },
      }),
    ],
  };
});
