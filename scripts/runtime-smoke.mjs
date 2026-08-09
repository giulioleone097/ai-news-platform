const baseUrl = process.env.NEURA_RUNTIME_BASE_URL || "http://127.0.0.1:3000";
const adminKey = process.env.NEURA_MCP_ADMIN_API_KEY;
const protocolVersion = "2026-07-28";

if (!adminKey) throw new Error("NEURA_MCP_ADMIN_API_KEY is required for the runtime smoke test.");

const clientMeta = {
  "io.modelcontextprotocol/protocolVersion": protocolVersion,
  "io.modelcontextprotocol/clientInfo": { name: "neura-runtime-proof", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  assert(response.status === expectedStatus, `${path}: expected ${expectedStatus}, got ${response.status}`);
  return response;
}

async function rpc(path, method, params = {}, authenticated = false) {
  const name = params?.name || "";
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
      "MCP-Method": method,
      ...(name ? { "MCP-Name": name } : {}),
      ...(authenticated ? { Authorization: `Bearer ${adminKey}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params: { ...params, _meta: clientMeta },
    }),
  });
  return { response, payload: await response.json() };
}

async function callAdmin(name, args) {
  const result = await rpc("/api/mcp/admin", "tools/call", { name, arguments: args }, true);
  assert(result.response.status === 200, `${name}: HTTP ${result.response.status}`);
  assert(result.payload?.result?.isError !== true, `${name}: ${JSON.stringify(result.payload)}`);
  return result.payload.result.structuredContent;
}

const root = await get("/", 308);
assert(new URL(root.headers.get("location"), baseUrl).pathname === "/en", "Root locale redirect failed.");
const home = await get("/en", 200);
assert((await home.text()).includes("NEURA"), "English home body is incomplete.");
await get("/it", 200);
await get("/en/articles/ai-agents-enter-every-work", 404);
await get("/en/articles/ai-agents-enter-everyday-work", 200);
await get("/en/search?q=agents", 200);
await get("/en/feed.xml", 200);
await get("/en/studio", 200);
await get("/en/studio/articles", 200);
await get("/en/studio/distribution", 200);
await get("/en/studio/media", 200);
await get("/en/studio/newsletter", 200);
const csv = await get("/en/studio/newsletter/export", 200);
assert(csv.headers.get("content-type")?.includes("text/csv"), "Newsletter export is not CSV.");

const health = await get("/api/health", 503);
const healthBody = await health.json();
assert(healthBody.contentMode === "demo" && healthBody.status === "not-ready", "Demo readiness is not explicit.");

const publicList = await rpc("/api/mcp", "tools/list");
assert(publicList.response.status === 200, "Public MCP tools/list failed.");
assert(publicList.payload.result.tools.length === 4, "Public MCP must expose exactly four tools.");
assert(
  publicList.payload.result.tools.every((tool) => tool.annotations?.readOnlyHint === true),
  "Every public MCP tool must be read-only.",
);

const denied = await rpc("/api/mcp/admin", "tools/list");
assert(denied.response.status === 401, "Admin MCP accepted a request without its API key.");
const adminList = await rpc("/api/mcp/admin", "tools/list", {}, true);
assert(adminList.response.status === 200, "Admin MCP tools/list failed.");
assert(adminList.payload.result.tools.length === 14, "Admin MCP must expose exactly 14 tools.");

const created = await callAdmin("admin_create_article", {
  locale: "en",
  title: "Runtime MCP lifecycle verification",
  excerpt: "A production runtime proof for the authenticated editorial MCP lifecycle.",
  content: "This runtime verification article contains enough editorial content to prove create, publish, public delivery, cache invalidation, and deletion through the authenticated MCP boundary.",
  categorySlug: "research",
  status: "draft",
});
const id = created.article.id;
const slug = created.article.slug;
assert(created.article.status === "draft", "Article was not created as a draft.");

const published = await callAdmin("admin_publish_article", { id, locale: "en" });
assert(published.article.status === "published", "Article was not published.");
const delivered = await get(`/en/articles/${slug}`, 200);
assert((await delivered.text()).includes("Runtime MCP lifecycle verification"), "Published page is stale.");

const newsletter = await callAdmin("admin_list_newsletter_subscriptions", {
  locale: "en",
  limit: 10,
  offset: 0,
});
assert(Array.isArray(newsletter.items) && typeof newsletter.total === "number", "Newsletter page contract failed.");
const distribution = await callAdmin("admin_list_distribution", { locale: "en" });
assert(Array.isArray(distribution.items), "Distribution contract failed.");
const media = await callAdmin("admin_list_media", {});
assert(Array.isArray(media.items), "Media contract failed.");

const deleted = await callAdmin("admin_delete_article", { id, locale: "en", confirm: true });
assert(deleted.deletedId === id, "Article deletion did not return the deleted ID.");
const gone = await get(`/en/articles/${slug}`, 404);
assert(!(await gone.text()).includes("Runtime MCP lifecycle verification"), "Deleted article remains cached.");

console.log(JSON.stringify({
  routes: 15,
  health: { status: 503, contentMode: healthBody.contentMode },
  publicMcpTools: publicList.payload.result.tools.length,
  adminMcpTools: adminList.payload.result.tools.length,
  articleLifecycle: ["create", "publish", "public-200", "delete", "public-404"],
  studio: ["dashboard", "articles", "distribution", "media", "newsletter", "csv"],
}));
