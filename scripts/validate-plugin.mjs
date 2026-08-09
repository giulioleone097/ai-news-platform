import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const pluginRoot = resolve(root, "plugins/neura-ai-news");

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const [codex, claude, copilot, mcp, codexMarket, claudeMarket, copilotMarket, skill] = await Promise.all([
  json("plugins/neura-ai-news/.codex-plugin/plugin.json"),
  json("plugins/neura-ai-news/.claude-plugin/plugin.json"),
  json("plugins/neura-ai-news/plugin.json"),
  json("plugins/neura-ai-news/.mcp.json"),
  json(".agents/plugins/marketplace.json"),
  json(".claude-plugin/marketplace.json"),
  json(".github/plugin/marketplace.json"),
  readFile(resolve(pluginRoot, "skills/neura-editorial/SKILL.md"), "utf8"),
]);

for (const manifest of [codex, claude, copilot]) {
  if (manifest.name !== "neura-ai-news" || manifest.version !== "1.0.0") {
    throw new Error("Plugin manifests must share the canonical name and version.");
  }
}
if (codex.mcpServers !== "./.mcp.json") throw new Error("Codex MCP bundle path is invalid.");
if (!mcp.mcpServers?.["neura-public"] || !mcp.mcpServers?.["neura-admin"]) {
  throw new Error("Both public and admin MCP servers are required.");
}
if (mcp.mcpServers["neura-admin"].bearer_token_env_var !== "NEURA_MCP_ADMIN_API_KEY") {
  throw new Error("Admin MCP must use the documented API-key environment variable.");
}
if (!skill.startsWith("---\nname: neura-editorial\n")) {
  throw new Error("Plugin skill frontmatter is invalid.");
}
for (const marketplace of [codexMarket, claudeMarket, copilotMarket]) {
  if (marketplace.plugins?.length !== 1 || marketplace.plugins[0].name !== "neura-ai-news") {
    throw new Error("Marketplace must expose exactly the canonical NEURA plugin.");
  }
}

const serialized = JSON.stringify({ codex, claude, copilot, mcp });
if (/sk-[A-Za-z0-9_-]{16,}|service_role\s*[:=]\s*[A-Za-z0-9._-]{16,}/i.test(serialized)) {
  throw new Error("Plugin bundle appears to contain a literal secret.");
}

console.log("NEURA agent plugin manifests are consistent.");
