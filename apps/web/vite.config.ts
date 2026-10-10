import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";

// Sites packages dist/ and requires dist/.openai/hosting.json next to dist/client and dist/server.
function sitesHostingManifest(): Plugin {
  let root = process.cwd();
  let command: "build" | "serve" = "build";
  return {
    name: "sites-hosting-manifest",
    configResolved(config) {
      root = config.root;
      command = config.command;
    },
    closeBundle() {
      if (command !== "build") return;
      mkdirSync(`${root}/dist/.openai`, { recursive: true });
      cpSync(`${root}/.openai/hosting.json`, `${root}/dist/.openai/hosting.json`);
    },
  };
}

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
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    define: { __PRESIZED_MEDIA__: JSON.stringify(presizedMedia()) },
    plugins: [
      vinext(),
      sitesHostingManifest(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: { main: "./build/sites-worker.ts", compatibility_flags: ["nodejs_compat"] },
      }),
    ],
  };
});
