import { spawn } from "node:child_process";
import { brotliCompressSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

// Two builds ship the reader site, so both are measured:
//   next   `next build` (.next): self-hosting with `next start`. Measured from its prerendered HTML.
//   sites  `vinext build` (dist): ChatGPT Sites, the default deployment. Its pages are rendered per request
//          by the Worker, so the artifact is run locally with `wrangler dev` (demo data, no account) and the
//          HTML it answers is measured the same way. Run `pnpm run build:sites` first.
// `node scripts/performance-budget.mjs [next|sites]` checks one; without an argument it checks both.
const root = process.cwd();
const webRoot = join(root, "apps", "web");
const nextRoot = join(webRoot, ".next");
const serverRoot = join(nextRoot, "server", "app");
const sitesRoot = join(webRoot, "dist");
const publicBudget = 145 * 1024;
// ceiling: the article page measures 144.2 KB (brotli) on the Sites build; the framework, vinext and the app
// entry are 131 KB of it and are not ours to shrink. Lower it with every vinext upgrade that makes them smaller.
const sitesPublicBudget = 148 * 1024;
const cssBudget = 35 * 1024;
const heroBudget = 250 * 1024;

const target = process.argv[2] ?? "all";
if (!["all", "next", "sites"].includes(target)) throw new Error(`Unknown target "${target}": use next, sites or none.`);

function compressedBytes(path) {
  return brotliCompressSync(readFileSync(path)).byteLength;
}

/** JavaScript and CSS that a page's HTML pulls in, as brotli bytes. `resolveAsset` maps a URL to a file. */
function routeAssets(html, resolveAsset) {
  // Next lists its chunks as scripts; vinext lists the entry as scripts and the rest as module preloads.
  const scripts = [
    ...html.matchAll(/<script(?=[^>]*\bsrc="([^"]+\.js[^"]*)")[^>]*>/g),
  ]
    .filter((match) => !/\bnomodule\b/i.test(match[0]))
    .map((match) => match[1]);
  const preloads = [...html.matchAll(/<link(?=[^>]*\brel="modulepreload")(?=[^>]*\bhref="([^"]+\.js[^"]*)")[^>]*>/g)]
    .map((match) => match[1]);
  const styles = [...html.matchAll(/<link(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="([^"]+\.css[^"]*)")[^>]*>/g)]
    .map((match) => match[1]);
  const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1]);
  const sum = (urls) => [...new Set(urls)]
    .map(resolveAsset)
    .filter(existsSync)
    .reduce((total, path) => total + compressedBytes(path), 0);
  const inlineCss = inlineStyles.length
    ? brotliCompressSync(Buffer.from(inlineStyles.join("\n"))).byteLength
    : 0;
  return { javascript: sum([...scripts, ...preloads]), css: sum(styles) + inlineCss };
}

const failures = [];

function check(route, assets, jsBudget) {
  console.log(`${route}: JS ${assets.javascript} B br, CSS ${assets.css} B br`);
  if (assets.javascript > jsBudget) failures.push(`${route} JS ${assets.javascript} > ${jsBudget}`);
  if (assets.css > cssBudget) failures.push(`${route} CSS ${assets.css} > ${cssBudget}`);
}

function findArticleHtml(locale) {
  const directory = join(serverRoot, locale, "articles");
  if (!existsSync(directory)) return null;
  const name = readdirSync(directory).find((entry) => entry.endsWith(".html"));
  return name ? join(directory, name) : null;
}

function checkNextBuild() {
  if (!existsSync(serverRoot)) throw new Error("Run next build before the performance budget check.");
  const resolveAsset = (url) => join(webRoot, url.replace(/^\/_next\//, ".next/").split("?")[0]);
  const candidates = [
    ["/en", join(serverRoot, "en.html")],
    ["/it", join(serverRoot, "it.html")],
    ["/en/latest", join(serverRoot, "en", "latest.html")],
    ["/it/latest", join(serverRoot, "it", "latest.html")],
    ["/en/articles/:slug", findArticleHtml("en")],
    ["/it/articles/:slug", findArticleHtml("it")],
  ].filter((entry) => entry[1] && existsSync(entry[1]));
  console.log("next build (.next)");
  for (const [route, htmlPath] of candidates) {
    check(route, routeAssets(readFileSync(htmlPath, "utf8"), resolveAsset), publicBudget);
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Runs `measure(origin)` against the built Sites Worker (`wrangler dev --local`, demo data) and stops it after. */
async function withSitesWorker(measure) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const worker = spawn(
    "pnpm",
    [
      "exec", "wrangler", "dev", "--config", "dist/server/wrangler.json", "--local",
      "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0",
      "--var", "ATLASNEWS_CONTENT_MODE:demo", "--var", `NEXT_PUBLIC_SITE_URL:${origin}`,
    ],
    { cwd: webRoot, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  let exited = false;
  worker.stdout.on("data", (chunk) => { output += chunk; });
  worker.stderr.on("data", (chunk) => { output += chunk; });
  worker.on("exit", () => { exited = true; });
  try {
    const deadline = Date.now() + 120_000;
    for (;;) {
      if (exited) throw new Error(`wrangler dev stopped before it was ready:\n${output.slice(-2000)}`);
      if (Date.now() > deadline) throw new Error(`wrangler dev was not ready in 120 s:\n${output.slice(-2000)}`);
      try {
        if ((await fetch(`${origin}/en`)).ok) break;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return await measure(origin);
  } finally {
    // The group, because `pnpm exec` starts wrangler and wrangler starts workerd.
    try {
      process.kill(-worker.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

async function checkSitesBuild() {
  if (!existsSync(join(sitesRoot, "server", "wrangler.json"))) {
    throw new Error("Run build:sites (vinext build) before the performance budget check.");
  }
  const resolveAsset = (url) => join(sitesRoot, "client", url.split("?")[0]);
  console.log("sites build (dist)");
  await withSitesWorker(async (origin) => {
    const page = async (path) => {
      const response = await fetch(`${origin}${path}`);
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status} from the Sites Worker.`);
      return response.text();
    };
    const latest = await page("/en/latest");
    const article = /href="(\/en\/articles\/[^"#?]+)"/.exec(latest)?.[1];
    if (!article) throw new Error("/en/latest links no article to measure.");
    const routes = [
      ["/en", "/en"],
      ["/it", "/it"],
      ["/en/latest", "/en/latest"],
      ["/it/latest", "/it/latest"],
      ["/en/articles/:slug", article],
      ["/it/articles/:slug", article.replace("/en/", "/it/")],
    ];
    for (const [route, path] of routes) {
      check(route, routeAssets(await page(path), resolveAsset), sitesPublicBudget);
    }
  });
}

if (target !== "sites") checkNextBuild();
if (target !== "next") await checkSitesBuild();

const heroFiles = [
  "atlas-hero.webp",
  "atlas-hero-480.webp",
  "atlas-hero-672.webp",
  "atlas-hero-750.webp",
  "atlas-hero-1200.webp",
  "atlas-hero-1536.webp",
];
for (const heroFile of heroFiles) {
  const heroBytes = statSync(join(webRoot, "public", "media", heroFile)).size;
  console.log(`${heroFile}: ${heroBytes} B`);
  if (heroBytes > heroBudget) failures.push(`${heroFile} ${heroBytes} > ${heroBudget}`);
}

if (failures.length) {
  throw new Error(`Performance budget exceeded:\n${failures.join("\n")}`);
}
