#!/usr/bin/env node
/**
 * The single owner of the packaging rules for `plugins/atlasnews`: one portable folder for
 * OpenAI (ChatGPT, Codex), Claude and Copilot CLI, and the three marketplace files that list it.
 *
 *   node scripts/validate-plugin.mjs             structure, limits, one MCP server, consistency
 *   node scripts/validate-plugin.mjs --release   the same, plus everything a store needs from the
 *                                                owner before submission (real URLs, licence, ...)
 *
 * Sources of the rules: developers.openai.com/plugins/{build/plugins,deploy/submission,
 * plugin-guidelines} and code.claude.com/docs/en/plugins/{manifest-reference,marketplace-reference}
 * plus claude.com/docs/plugins/pre-submission-checklist (read 2026-10-10).
 */
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const release = process.argv.includes("--release");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginName = "atlasnews";
const marketplaceName = "atlasnews-plugins";
const pluginDir = `plugins/${pluginName}`;
const pluginRoot = resolve(root, pluginDir);

/** Rules of the store, in one place. */
const limits = {
  name: 64,
  displayName: 30,
  shortDescription: 30,
  longDescription: 4000,
  developerName: 80,
  description: 4000,
  authorName: 120,
  authorEmail: 320,
  authorUrl: 2048,
  capabilities: 20,
  capability: 120,
  prompts: 3,
  prompt: 128,
  url: 1024,
  subtitle: 30,
  readmeWords: 40,
  textFileBytes: 256 * 1024,
  imageBytes: 5 * 1024 * 1024,
  files: 512,
  iconPixels: 48,
  positiveCases: 5,
  negativeCases: 3,
};
const agentPluginsSchema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const agentMcpSchema = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
/** Scopes Supabase Auth can grant (docs/MCP.md). The server advertises `email` only. */
const grantableScopes = ["openid", "profile", "email", "phone", "offline_access"];
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const fontExtensions = new Set([".woff", ".woff2", ".ttf", ".otf"]);
const forbiddenKeys = ["test_credentials", "reviewer_instructions", "clientSecret", "headers", "bearer_token_env_var", "hooks", "apps", "userConfig"];
const forbiddenText = /api[ _-]?key|ADMIN_API|neura(?!l)/i;
const placeholderHost = "owner-must-supply.invalid";

const problems = [];
const toSupply = [];
const fail = (message) => problems.push(message);
const supply = (message) => toSupply.push(message);

const read = (path) => readFile(resolve(root, path), "utf8");
async function readJson(path) {
  try {
    return JSON.parse(await read(path));
  } catch (error) {
    fail(`${path}: ${error.code === "ENOENT" ? "missing" : `not valid JSON (${error.message})`}`);
    return null;
  }
}
const exists = (path) => lstat(resolve(root, path)).then(() => true, () => false);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max) => typeof value === "string" && value.trim() !== "" && value.length <= max;

function need(file, path, value, max) {
  if (!text(value, max)) fail(`${file}: ${path} must be a non-empty string of at most ${max} characters.`);
  return text(value, max);
}

// ---- URLs ---------------------------------------------------------------------------------

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const localHost = /^(localhost|127\.|0\.0\.0\.0$|\[::1\]$|\[::\]$)|\.(local|localhost|test|example|invalid)$|(^|\.)example\.(com|net|org)$/i;
const isPlaceholderUrl = (url) => localHost.test(url.hostname) || /placeholder|todo|replace/i.test(url.href);

/** Default mode: shape. Release mode: the address must be real and public. */
function checkUrl(file, path, value, { https = true, required = true, owner = true } = {}) {
  if (value === undefined && !required) return;
  const url = typeof value === "string" ? parseUrl(value) : null;
  if (!url || value.length > limits.url || url.username || url.password || (https ? url.protocol !== "https:" : !/^https?:$/.test(url.protocol))) {
    fail(`${file}: ${path} must be a ${https ? "HTTPS" : "HTTP(S)"} URL of at most ${limits.url} characters without credentials.`);
    return;
  }
  if (!release || !owner) return;
  if (isPlaceholderUrl(url)) supply(`${file}: ${path} is ${url.host === placeholderHost ? "a placeholder" : `not a public address (${url.origin})`}; supply the real HTTPS URL.`);
  else if (url.protocol !== "https:") supply(`${file}: ${path} must be HTTPS.`);
}

// ---- files --------------------------------------------------------------------------------

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isSymbolicLink()) fail(`${relative(root, path)}: symbolic links are not allowed in a plugin.`);
    else if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}

async function checkFiles() {
  const files = await walk(pluginRoot);
  if (files.length > limits.files) fail(`${pluginDir}: ${files.length} files, at most ${limits.files}.`);
  const texts = new Map();
  for (const file of files) {
    const rel = relative(root, file);
    const ext = extname(file).toLowerCase();
    const size = (await lstat(file)).size;
    if (/(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX)/.test(rel)) fail(`${rel}: system file.`);
    if (imageExtensions.has(ext)) {
      if (size > limits.imageBytes) fail(`${rel}: image over 5 MiB.`);
    } else if (fontExtensions.has(ext)) {
      continue;
    } else {
      if (size > limits.textFileBytes) fail(`${rel}: text file over 256 KiB.`);
      const content = await readFile(file, "utf8");
      if (content.includes("\u0000")) fail(`${rel}: binary content; only text, images and fonts are allowed.`);
      texts.set(rel, content);
    }
  }
  for (const banned of [".codex-plugin", ".app.json", "hooks", "apps", "bin", "agents", "commands"]) {
    if (await exists(`${pluginDir}/${banned}`)) fail(`${pluginDir}/${banned}: not part of this package (the legacy Codex overlay is superseded by plugin.json; hooks, apps and app references cannot be submitted).`);
  }
  const claudeDir = (await readdir(resolve(pluginRoot, ".claude-plugin"), { withFileTypes: true }).catch(() => [])).map((entry) => entry.name);
  if (claudeDir.join() !== "plugin.json") fail(`${pluginDir}/.claude-plugin must contain only plugin.json (found: ${claudeDir.join(", ") || "nothing"}).`);
  for (const [rel, content] of texts) {
    const match = content.match(forbiddenText);
    if (match) fail(`${rel}: contains "${match[0]}"; the plugin has no API key and carries no old product name.`);
  }
  return texts;
}

function findKeys(value, path = "") {
  if (!isObject(value) && !Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbiddenKeys.includes(key) ? [`${path}${key}`] : []),
    ...findKeys(child, `${path}${key}.`),
  ]);
}

async function checkAsset(file, path, value) {
  if (typeof value !== "string" || !value.startsWith("./") || value.split("/").includes("..")) {
    fail(`${file}: ${path} must be a path inside the plugin starting with ./ (got ${JSON.stringify(value)}).`);
    return;
  }
  const rel = `${pluginDir}/${value.slice(2)}`;
  if (!await exists(rel)) return fail(`${file}: ${path} points at ${value}, which does not exist.`);
  const ext = extname(value).toLowerCase();
  if (!imageExtensions.has(ext)) return fail(`${file}: ${path} must be PNG, JPEG, GIF, WebP or SVG.`);
  if (ext !== ".svg") return;
  const svg = await read(rel);
  const width = Number(svg.match(/<svg[^>]*\swidth="([\d.]+)"/)?.[1]);
  const height = Number(svg.match(/<svg[^>]*\sheight="([\d.]+)"/)?.[1]);
  const box = svg.match(/viewBox="[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
  const [w, h] = width && height ? [width, height] : box ? [Number(box[1]), Number(box[2])] : [0, 0];
  if (w !== h || w < limits.iconPixels) fail(`${rel}: an SVG icon must be square and at least ${limits.iconPixels}x${limits.iconPixels} (got ${w}x${h}).`);
}

// ---- brand --------------------------------------------------------------------------------

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

async function designColors() {
  const design = await read("DESIGN.md");
  const block = design.match(/^colors:\n((?:  .*\n)+)/m)?.[1] ?? "";
  return new Set([...block.matchAll(/:\s*"(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase()));
}

// ---- catalogue ----------------------------------------------------------------------------

/** Tool names: every capability spec of the contract plus the MCP Apps entrypoints. */
async function toolNames() {
  const names = new Set(["open_newsroom", "open_news_panel", "search_mentions", "build_briefing"]);
  const dir = resolve(root, "packages/contract/src/specs");
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    for (const match of (await readFile(resolve(dir, file), "utf8")).matchAll(/^\s+name: "([a-z]+(?:_[a-z]+)*)",$/gm)) names.add(match[1]);
  }
  return names;
}

// ---- manifests ----------------------------------------------------------------------------

function checkListing(file, listing) {
  const urls = [["websiteURL"], ["supportURL"], ["privacyPolicyURL"], ["termsOfServiceURL"]];
  for (const [key] of urls) checkUrl(file, `interface.${key}`, listing[key]);
}

async function checkPortable(plugin, names, colors) {
  const file = `${pluginDir}/plugin.json`;
  if (plugin.$schema !== agentPluginsSchema) fail(`${file}: $schema must be ${agentPluginsSchema}.`);
  if (typeof plugin.name !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name) || plugin.name.length > limits.name || plugin.name !== pluginName) fail(`${file}: name must be "${pluginName}" (lowercase, digits, single hyphens, at most ${limits.name}).`);
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(plugin.version ?? "")) fail(`${file}: version must be a semantic version.`);
  need(file, "description", plugin.description, limits.description);
  need(file, "author.name", plugin.author?.name, limits.authorName);
  if (plugin.author?.email !== undefined) need(file, "author.email", plugin.author.email, limits.authorEmail);
  if (plugin.author?.url !== undefined) checkUrl(file, "author.url", plugin.author.url);
  checkUrl(file, "homepage", plugin.homepage);
  if (plugin.homepage !== plugin.extensions?.["com.openai"]?.interface?.websiteURL) fail(`${file}: homepage must equal interface.websiteURL.`);
  if (release) {
    const repository = parseUrl(plugin.repository ?? "");
    if (!repository || repository.hostname !== "github.com") supply(`${file}: repository must be the public GitHub repository (the Claude directory reads plugins from it).`);
    if (!text(plugin.license, 64)) supply(`${file}: license (an SPDX identifier such as MIT) is missing; the owner picks the licence.`);
  }
  if (!Array.isArray(plugin.keywords) || plugin.keywords.some((k) => typeof k !== "string")) fail(`${file}: keywords must be an array of strings.`);

  const openai = plugin.extensions?.["com.openai"];
  if (!isObject(openai)) return fail(`${file}: extensions["com.openai"] is missing.`);
  const face = openai.interface ?? {};
  need(file, "interface.displayName", face.displayName, limits.displayName);
  need(file, "interface.shortDescription", face.shortDescription, limits.shortDescription);
  need(file, "interface.longDescription", face.longDescription, limits.longDescription);
  need(file, "interface.developerName", face.developerName, limits.developerName);
  need(file, "interface.category", face.category, 64);
  const caps = face.capabilities;
  if (!Array.isArray(caps) || caps.length > limits.capabilities || caps.some((c) => !text(c, limits.capability))) fail(`${file}: interface.capabilities must be at most ${limits.capabilities} strings of at most ${limits.capability} characters.`);
  const prompts = face.defaultPrompt;
  if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > limits.prompts || new Set(prompts).size !== prompts.length || prompts.some((p) => !text(p, limits.prompt) || p.includes("@"))) fail(`${file}: interface.defaultPrompt must be 1 to ${limits.prompts} unique prompts of at most ${limits.prompt} characters without @ mentions.`);
  checkListing(file, face);

  for (const [key, background] of [["brandColor", "#ffffff"], ["brandColorDark", "#212121"]]) {
    const color = face[key];
    if (!/^#[0-9a-fA-F]{6}$/.test(color ?? "")) fail(`${file}: interface.${key} must be #RRGGBB.`);
    else {
      if (contrast(color, background) < 2) fail(`${file}: interface.${key} needs a contrast of at least 2:1 against ${background}.`);
      if (!colors.has(color.toLowerCase())) fail(`${file}: interface.${key} ${color} is not a colour of DESIGN.md.`);
    }
  }
  const icons = ["composerIcon", "composerIconDark", "logo", "logoDark"];
  for (const key of icons) {
    if (face[key] === undefined) {
      if (release) supply(`${file}: interface.${key} is missing.`);
    } else await checkAsset(file, `interface.${key}`, face[key]);
  }
  if (!face.logo) fail(`${file}: interface.logo is required.`);

  if (!/^\.\/skills\/[a-z0-9-]+\/SKILL\.md$/.test(openai.onboardingSkill ?? "") || !await exists(`${pluginDir}/${String(openai.onboardingSkill).slice(2)}`)) fail(`${file}: onboardingSkill must point at an existing skill of the package.`);

  const cases = openai.review?.test_cases;
  const positive = cases?.positive ?? [];
  const negative = cases?.negative ?? [];
  if (positive.length !== limits.positiveCases) fail(`${file}: review.test_cases.positive must hold exactly ${limits.positiveCases} cases (has ${positive.length}).`);
  if (negative.length !== limits.negativeCases) fail(`${file}: review.test_cases.negative must hold exactly ${limits.negativeCases} cases (has ${negative.length}).`);
  positive.forEach((c, i) => {
    for (const key of ["description", "prompt", "tools_triggered", "expected_behavior"]) need(file, `review.test_cases.positive[${i}].${key}`, c[key], 1000);
    for (const tool of String(c.tools_triggered).split(",").map((t) => t.trim())) if (!names.has(tool)) fail(`${file}: positive[${i}] triggers "${tool}", which is not a tool of the server.`);
  });
  negative.forEach((c, i) => {
    for (const key of ["description", "prompt"]) need(file, `review.test_cases.negative[${i}].${key}`, c[key], 1000);
  });
  if (typeof openai.review?.commerce !== "boolean") fail(`${file}: review.commerce must be a boolean.`);
  checkUrl(file, "review.demo_recording_url", openai.review?.demo_recording_url);
  need(file, "publication.release_notes", openai.publication?.release_notes, 4000);
  for (const [locale, t] of Object.entries(openai.publication?.translations ?? {})) {
    if (!text(t.subtitle, limits.subtitle) || /\n/.test(t.subtitle)) fail(`${file}: translations.${locale}.subtitle must be one line of at most ${limits.subtitle} characters.`);
    need(file, `translations.${locale}.description`, t.description, 4000);
  }
  return face;
}

async function checkClaude(claude, plugin, face) {
  const file = `${pluginDir}/.claude-plugin/plugin.json`;
  if (claude.name !== plugin.name) fail(`${file}: name must equal the portable manifest (${plugin.name}).`);
  for (const key of ["version", "description", "homepage", "repository", "license"]) {
    if (claude[key] !== plugin[key]) fail(`${file}: ${key} differs from plugin.json.`);
  }
  if (JSON.stringify(claude.author) !== JSON.stringify(plugin.author)) fail(`${file}: author differs from plugin.json.`);
  if (claude.displayName !== face.displayName) fail(`${file}: displayName must equal interface.displayName.`);
  const pairs = [["supportUrl", "supportURL"], ["privacyPolicyUrl", "privacyPolicyURL"], ["termsOfServiceUrl", "termsOfServiceURL"]];
  for (const [claudeKey, openaiKey] of pairs) {
    if (claude[claudeKey] !== face[openaiKey]) fail(`${file}: ${claudeKey} must equal interface.${openaiKey}.`);
  }
  checkUrl(file, "documentationUrl", claude.documentationUrl);
  for (const key of ["mcpServers", "hooks", "commands", "agents", "userConfig", "extensions"]) {
    if (key in claude) fail(`${file}: ${key} is not used; the server is declared in .mcp.json.`);
  }
  if (claude.icon !== undefined) await checkAsset(file, "icon", claude.icon);
  else if (release) supply(`${file}: icon is missing (the Claude directory listing icon).`);
}

async function checkMcp(portable, claude, supabase) {
  const file = `${pluginDir}/mcp.json`;
  const other = `${pluginDir}/.mcp.json`;
  if (portable.$schema !== agentMcpSchema) fail(`${file}: $schema must be ${agentMcpSchema}.`);
  const servers = Object.entries(portable.mcpServers ?? {});
  const claudeServers = Object.entries(claude.mcpServers ?? {});
  if (servers.length !== 1) fail(`${file}: exactly one MCP server is allowed per plugin (has ${servers.length}).`);
  if (claudeServers.length !== 1) fail(`${other}: exactly one MCP server is allowed per plugin (has ${claudeServers.length}).`);
  if (servers.length !== 1 || claudeServers.length !== 1) return;
  const [[name, server]] = servers;
  const [[claudeName, claudeServer]] = claudeServers;
  if (name !== pluginName || claudeName !== name) fail(`${file} and ${other}: the server must be named "${pluginName}" in both (found "${name}" and "${claudeName}").`);
  if (server.type !== "streamable-http") fail(`${file}: type must be "streamable-http".`);
  if (claudeServer.type !== "http") fail(`${other}: type must be "http" (Claude requires a type).`);
  checkUrl(file, `mcpServers.${name}.url`, server.url, { https: false });
  checkUrl(other, `mcpServers.${name}.url`, claudeServer.url, { https: false, owner: false });
  if (server.url !== claudeServer.url) fail(`${file} and ${other}: the server URL differs.`);
  if (!/\/mcp$/.test(parseUrl(server.url)?.pathname ?? "")) fail(`${file}: the URL must end with /mcp, the one endpoint of apps/mcp.`);
  for (const key of Object.keys(claudeServer)) if (!["type", "url"].includes(key)) fail(`${other}: ${key} is not allowed; the server needs no headers, keys or oauth overrides.`);
  for (const key of Object.keys(server)) if (!["type", "url", "extensions"].includes(key)) fail(`${file}: ${key} is not allowed (no headers: public submission rejects them).`);

  // The declaration must say what the server does: anonymous reads, OAuth 2.1 for editors with
  // dynamic registration (Supabase Auth), and only the scopes Supabase can grant.
  const auth = server.extensions?.["com.openai"]?.auth;
  if (auth?.type !== "mixed") fail(`${file}: auth.type must be "mixed" (anonymous reads plus OAuth for editor tools).`);
  if (auth?.client?.mode !== "dcr" || "clientId" in (auth?.client ?? {})) fail(`${file}: auth.client.mode must be "dcr" without a clientId (Supabase Auth registers clients dynamically).`);
  if (!/allow_dynamic_registration\s*=\s*true/.test(supabase)) fail("supabase/config.toml: the plugin declares dynamic client registration, but allow_dynamic_registration is not true.");
  for (const key of ["defaultScopes", "baseScopes"]) {
    const scopes = auth?.[key];
    if (scopes !== undefined && (!Array.isArray(scopes) || scopes.some((s) => !grantableScopes.includes(s)))) fail(`${file}: auth.${key} may only hold scopes Supabase Auth grants (${grantableScopes.join(", ")}); the newsroom scopes are decided server-side from the editor profile.`);
  }
  for (const key of Object.keys(auth ?? {})) if (!["type", "client", "baseScopes", "defaultScopes"].includes(key)) fail(`${file}: auth.${key} is not declared; the server publishes it through resource metadata.`);
}

// ---- skills -------------------------------------------------------------------------------

async function checkSkills(names, texts) {
  const dirs = (await readdir(resolve(pluginRoot, "skills"), { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name);
  if (!dirs.length) fail(`${pluginDir}/skills: no skill found.`);
  for (const dir of dirs) {
    const rel = `${pluginDir}/skills/${dir}/SKILL.md`;
    const content = texts.get(rel);
    if (content === undefined) {
      fail(`${rel}: missing.`);
      continue;
    }
    const head = content.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/);
    if (!head) fail(`${rel}: must start with front matter holding name and description.`);
    else if (head[1] !== dir || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(head[1])) fail(`${rel}: name "${head[1]}" must equal its folder and be lowercase-hyphenated.`);
    for (const [, token] of content.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
      if (!names.has(token)) fail(`${rel}: \`${token}\` is not a tool of the server.`);
    }
  }
}

function checkReadme(texts) {
  const rel = `${pluginDir}/README.md`;
  const prose = (texts.get(rel) ?? "").replace(/```[\s\S]*?```/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  if (words < limits.readmeWords) fail(`${rel}: ${words} words outside code blocks, at least ${limits.readmeWords} are required.`);
}

// ---- marketplaces -------------------------------------------------------------------------

const reservedMarketplace = /^(claude|anthropic)|official|^(agent-skills|knowledge-work-plugins|life-sciences|healthcare|inline|builtin|synced)$/i;

async function checkMarketplaces(plugin) {
  const source = `./${pluginDir}`;
  const files = {
    ".claude-plugin/marketplace.json": (entry) => entry.source === source,
    ".github/plugin/marketplace.json": (entry) => entry.source === source,
    ".agents/plugins/marketplace.json": (entry) => entry.source?.source === "local" && entry.source.path === source
      && ["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(entry.policy?.installation)
      && text(entry.policy?.authentication, 32) && text(entry.category, 64),
  };
  for (const [file, sourceOk] of Object.entries(files)) {
    const market = await readJson(file);
    if (!market) continue;
    if (market.name !== marketplaceName || reservedMarketplace.test(market.name)) fail(`${file}: name must be "${marketplaceName}".`);
    if (!file.startsWith(".agents") && !text(market.owner?.name, 120)) fail(`${file}: owner.name is required.`);
    const entries = market.plugins ?? [];
    if (entries.length !== 1 || entries[0].name !== plugin.name) fail(`${file}: must list exactly the plugin "${plugin.name}".`);
    else if (!sourceOk(entries[0])) fail(`${file}: the plugin source must be ${source} (resolved from the repository root, no ..).`);
    if (entries[0]?.description !== undefined && !text(entries[0].description, limits.description)) fail(`${file}: description is empty or too long.`);
  }
}

// ---- run ----------------------------------------------------------------------------------

const [plugin, claude, portableMcp, claudeMcp, colors, names, supabase] = await Promise.all([
  readJson(`${pluginDir}/plugin.json`),
  readJson(`${pluginDir}/.claude-plugin/plugin.json`),
  readJson(`${pluginDir}/mcp.json`),
  readJson(`${pluginDir}/.mcp.json`),
  designColors(),
  toolNames(),
  read("supabase/config.toml"),
]);
const texts = await checkFiles();
const manifests = [[`${pluginDir}/plugin.json`, plugin], [`${pluginDir}/.claude-plugin/plugin.json`, claude], [`${pluginDir}/mcp.json`, portableMcp], [`${pluginDir}/.mcp.json`, claudeMcp]];
for (const [file, json] of manifests) for (const key of findKeys(json)) fail(`${file}: "${key}" is not accepted in a public plugin.`);
if (plugin && claude && portableMcp && claudeMcp) {
  const face = await checkPortable(plugin, names, colors);
  if (face) await checkClaude(claude, plugin, face);
  await checkMcp(portableMcp, claudeMcp, supabase);
  await checkSkills(names, texts);
  checkReadme(texts);
  await checkMarketplaces(plugin);
}

const mode = release ? "release" : "default";
if (problems.length) {
  console.error(`Plugin ${mode} check failed with ${problems.length} problem(s) in the package itself:`);
  for (const message of problems) console.error(`  - ${message}`);
}
if (release && toSupply.length) {
  console.error(`Release check: ${toSupply.length} item(s) the owner must supply before submission:`);
  for (const message of toSupply) console.error(`  - ${message}`);
}
if (problems.length || toSupply.length) process.exit(1);
console.log(`Plugin ${mode} check passed: ${pluginName} ${plugin.version}, one MCP server, 3 marketplaces, ${names.size} known tools.`);
