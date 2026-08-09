import { brotliCompressSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nextRoot = join(root, ".next");
const serverRoot = join(nextRoot, "server", "app");
const publicBudget = 145 * 1024;
const cssBudget = 35 * 1024;
const heroBudget = 250 * 1024;

if (!existsSync(serverRoot)) throw new Error("Run next build before the performance budget check.");

function compressedBytes(path) {
  return brotliCompressSync(readFileSync(path)).byteLength;
}

function resolveAsset(url) {
  return join(root, url.replace(/^\/_next\//, ".next/").split("?")[0]);
}

function routeAssets(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  const scripts = [...html.matchAll(/<script(?=[^>]*\bsrc="([^"]+\.js[^"]*)")[^>]*>/g)]
    .filter((match) => !/\bnomodule\b/i.test(match[0]))
    .map((match) => match[1]);
  const styles = [...html.matchAll(/<link(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="([^"]+\.css[^"]*)")[^>]*>/g)]
    .map((match) => match[1]);
  const sum = (urls) => [...new Set(urls)]
    .map(resolveAsset)
    .filter(existsSync)
    .reduce((total, path) => total + compressedBytes(path), 0);
  return { javascript: sum(scripts), css: sum(styles) };
}

function findArticleHtml(locale) {
  const directory = join(serverRoot, locale, "articles");
  if (!existsSync(directory)) return null;
  const name = readdirSync(directory).find((entry) => entry.endsWith(".html"));
  return name ? join(directory, name) : null;
}

const candidates = [
  ["/en", join(serverRoot, "en.html")],
  ["/it", join(serverRoot, "it.html")],
  ["/en/latest", join(serverRoot, "en", "latest.html")],
  ["/it/latest", join(serverRoot, "it", "latest.html")],
  ["/en/articles/:slug", findArticleHtml("en")],
  ["/it/articles/:slug", findArticleHtml("it")],
].filter((entry) => entry[1] && existsSync(entry[1]));

const failures = [];
for (const [route, htmlPath] of candidates) {
  const assets = routeAssets(htmlPath);
  console.log(`${route}: JS ${assets.javascript} B br, CSS ${assets.css} B br`);
  if (assets.javascript > publicBudget) failures.push(`${route} JS ${assets.javascript} > ${publicBudget}`);
  if (assets.css > cssBudget) failures.push(`${route} CSS ${assets.css} > ${cssBudget}`);
}

const heroFiles = [
  "neura-agents-hero.webp",
  "neura-agents-hero-480.webp",
  "neura-agents-hero-750.webp",
  "neura-agents-hero-1200.webp",
  "neura-agents-hero-1536.webp",
];
for (const heroFile of heroFiles) {
  const heroBytes = statSync(join(root, "public", "media", heroFile)).size;
  console.log(`${heroFile}: ${heroBytes} B`);
  if (heroBytes > heroBudget) failures.push(`${heroFile} ${heroBytes} > ${heroBudget}`);
}

if (failures.length) {
  throw new Error(`Performance budget exceeded:\n${failures.join("\n")}`);
}
