import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Dependency rule: core <- contract/adapters <- apps. Packages stay free of the
// delivery framework so that mcp and jobs can run under plain Node.
const framework = [
  { group: ["next", "next/*"], message: "Framework code belongs in apps/web." },
  { group: ["react", "react/*", "react-dom", "react-dom/*"], message: "UI code belongs in apps/web." },
  { name: "server-only", message: "The server-only guard belongs in apps/web files." },
];
const apps = [
  { group: ["@atlasnews/web", "@atlasnews/web/*", "@atlasnews/mcp", "@atlasnews/mcp/*", "@atlasnews/jobs", "@atlasnews/jobs/*"], message: "Packages must not import apps." },
  { group: ["**/apps/**"], message: "Packages must not import apps." },
];
const adapters = { group: ["@atlasnews/adapters", "@atlasnews/adapters/*"], message: "Only adapters and apps may import the adapters package." };
const contract = { group: ["@atlasnews/contract", "@atlasnews/contract/*"], message: "core must not depend on contract." };
const supabase = { group: ["@supabase/*"], message: "Supabase belongs in the adapters package." };
const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { paths: patterns.flatMap((p) => (p.name ? [p] : [])), patterns: patterns.flatMap((p) => (p.group ? [p] : [])) }] });
const otherApps = (self) => ({
  group: ["web", "mcp", "jobs"].filter((app) => app !== self).flatMap((app) => [`@atlasnews/${app}`, `@atlasnews/${app}/*`]),
  message: "An app must not import another app.",
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React lives only in apps/web, so "detect" cannot resolve it from the other workspaces' files.
  { settings: { next: { rootDir: "apps/web" }, react: { version: "19" } } },
  { files: ["packages/core/**/*.{ts,tsx}"], rules: restrict(...framework, ...apps, adapters, contract, supabase) },
  { files: ["packages/contract/**/*.{ts,tsx}"], rules: restrict(...framework, ...apps, adapters, supabase) },
  { files: ["packages/adapters/**/*.{ts,tsx}"], rules: restrict(...framework, ...apps) },
  { files: ["apps/mcp/**/*.{ts,tsx}"], rules: restrict(...framework, otherApps("mcp")) },
  { files: ["apps/jobs/**/*.{ts,tsx}"], rules: restrict(...framework, otherApps("jobs")) },
  { files: ["apps/web/**/*.{ts,tsx}"], rules: restrict(otherApps("web")) },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Per-app equivalents:
    "apps/*/.next/**",
    "apps/*/out/**",
    "apps/*/build/**",
    "apps/*/next-env.d.ts",
    // Sites (vinext/wrangler) build output:
    "apps/*/dist/**",
    "apps/*/.wrangler/**",
  ]),
]);

export default eslintConfig;
