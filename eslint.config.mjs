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
const coreAllowList = {
  regex: "^(?!\\.{1,2}/|zod(/|$)|unified$|remark-(gfm|parse)$).",
  message: "packages/core imports only relative files, zod and the markdown parser; platform and framework code belongs in an adapter or app.",
};
const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { paths: patterns.flatMap((p) => (p.name ? [p] : [])), patterns: patterns.flatMap((p) => (p.group || p.regex ? [p] : [])) }] });
const otherApps = (self) => ({
  group: ["web", "mcp", "jobs"].filter((app) => app !== self).flatMap((app) => [`@atlasnews/${app}`, `@atlasnews/${app}/*`]),
  message: "An app must not import another app.",
});

// A Server Action reaches the content through a catalogue capability (`runStudioCapability`), which checks the
// editor's scope, records who acted and asks for confirmation. Importing a core service or the composition root
// would skip all three, so a new bypass fails lint. Reads in pages and the one upload helper in `server/` are not actions.
const studioBypass = [
  { group: ["@atlasnews/core/*/application/*"], message: "A Server Action runs a catalogue capability with runStudioCapability; it does not call a core service." },
  { group: ["@/server/composition"], message: "A Server Action runs a catalogue capability with runStudioCapability; it does not build services or repositories." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React lives only in apps/web, so "detect" cannot resolve it from the other workspaces' files.
  { settings: { next: { rootDir: "apps/web" }, react: { version: "19" } } },
  { files: ["packages/core/**/*.{ts,tsx}"], rules: restrict(...framework, ...apps, adapters, contract, supabase) },
  // Core runs on Node, Workers and the browser, so non-test files import only their own files, zod and the markdown
  // parser, and read no environment. Hashing and ids come from src/crypto.ts; the image policy is passed in.
  // Tests may use node:crypto to check core against the platform.
  {
    files: ["packages/core/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/test-support.ts"],
    rules: {
      ...restrict(...framework, ...apps, adapters, contract, supabase, coreAllowList),
      "no-restricted-properties": ["error", { object: "process", property: "env", message: "packages/core reads no environment: inject the setting." }],
    },
  },
  { files: ["packages/contract/**/*.{ts,tsx}"], rules: restrict(...framework, ...apps, adapters, supabase) },
  { files: ["packages/adapters/**/*.{ts,tsx}"], rules: restrict(...framework, ...apps) },
  { files: ["apps/mcp/**/*.{ts,tsx}"], rules: restrict(...framework, otherApps("mcp")) },
  { files: ["apps/jobs/**/*.{ts,tsx}"], rules: restrict(...framework, otherApps("jobs")) },
  { files: ["apps/web/**/*.{ts,tsx}"], rules: restrict(otherApps("web")) },
  // The Sites Worker is the one place where the three apps meet: it routes /mcp and /internal to the other two,
  // through their request handlers and nothing else.
  {
    files: ["apps/web/build/sites-worker.ts"],
    rules: restrict(
      // A bare name in a pattern would also exclude everything below it, so the package roots are plain paths.
      { name: "@atlasnews/mcp", message: "The Sites Worker may import only the request handlers of mcp and jobs." },
      { name: "@atlasnews/jobs", message: "The Sites Worker may import only the request handlers of mcp and jobs." },
      { group: ["@atlasnews/mcp/*", "@atlasnews/jobs/*", "!@atlasnews/mcp/handler", "!@atlasnews/jobs/handler", "!@atlasnews/jobs/scheduled"], message: "The Sites Worker may import only the request handlers of mcp and jobs." },
    ),
  },
  // The reader site's actions (a token-checked notification preference) have no editor session or capability; the Studio's and the OAuth consent's do.
  { files: ["apps/web/src/app/**/*actions.ts"], ignores: ["**/(site)/**"], rules: restrict(otherApps("web"), ...studioBypass) },
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
    "apps/*/next-env.d.ts",
    // Sites (vinext/wrangler) build output:
    "apps/*/dist/**",
    "apps/*/.wrangler/**",
  ]),
]);

export default eslintConfig;
