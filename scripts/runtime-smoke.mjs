const baseUrl = process.env.NEURA_RUNTIME_BASE_URL || "http://127.0.0.1:3000";
const mcpUrl = process.env.NEURA_RUNTIME_MCP_URL || "http://127.0.0.1:8787";
const adminKey = process.env.NEURA_MCP_ADMIN_API_KEY;
// Optional: the shared secret of POST /api/revalidate, set on the site and on the MCP process.
const revalidateSecret = process.env.NEURA_REVALIDATE_SECRET;
const protocolVersion = "2026-07-28";

if (!adminKey) throw new Error("NEURA_MCP_ADMIN_API_KEY is required for the runtime smoke test.");

const clientMeta = {
  "io.modelcontextprotocol/protocolVersion": protocolVersion,
  "io.modelcontextprotocol/clientInfo": { name: "atlasnews-runtime-proof", version: "1.0.0" },
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

async function rpc(method, params = {}, authorization = undefined) {
  const name = params?.name || "";
  const response = await fetch(`${mcpUrl}/mcp`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
      "MCP-Method": method,
      ...(name ? { "MCP-Name": name } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
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
  const result = await rpc("tools/call", { name, arguments: args }, `Bearer ${adminKey}`);
  assert(result.response.status === 200, `${name}: HTTP ${result.response.status}`);
  assert(result.payload?.result?.isError !== true, `${name}: ${JSON.stringify(result.payload)}`);
  return result.payload.result.structuredContent;
}

const root = await get("/", 308);
assert(new URL(root.headers.get("location"), baseUrl).pathname === "/en", "Root locale redirect failed.");
const home = await get("/en", 200);
assert(/NEURA|AtlasNews/.test(await home.text()), "English home body is incomplete.");
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
const commentModeration = await get("/en/studio/comments", 200);
assert(
  (await commentModeration.text()).includes("Comment moderation is not configured."),
  "Demo comment moderation did not render its explicit unavailable state.",
);
await get("/en/studio/newsletter/campaigns", 200);
const csv = await get("/en/studio/newsletter/export", 200);
assert(csv.headers.get("content-type")?.includes("text/csv"), "Newsletter export is not CSV.");

const health = await get("/api/health", 503);
const healthBody = await health.json();
assert(healthBody.contentMode === "demo" && healthBody.status === "not-ready", "Demo readiness is not explicit.");

const revalidateWithoutSecret = await fetch(`${baseUrl}/api/revalidate`, { method: "POST" });
assert(
  revalidateWithoutSecret.status === 401 || revalidateWithoutSecret.status === 503,
  `POST /api/revalidate without a secret answered ${revalidateWithoutSecret.status}.`,
);
if (revalidateSecret) {
  const revalidated = await fetch(`${baseUrl}/api/revalidate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revalidateSecret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "en", slugs: [] }),
  });
  assert(revalidated.status === 200, `POST /api/revalidate with the secret answered ${revalidated.status}.`);
}

const discovered = await rpc("server/discover");
assert(discovered.response.status === 200, "MCP server/discover failed.");
assert(
  discovered.payload.result._meta["io.modelcontextprotocol/serverInfo"].name === "atlasnews",
  "MCP server is not named atlasnews.",
);

const list = await rpc("tools/list");
assert(list.response.status === 200, "Anonymous MCP tools/list failed.");
const tools = list.payload.result.tools;
assert(tools.length === 48, `MCP must list 48 tools, got ${tools.length}.`);
const schemeOf = (tool) => tool._meta?.securitySchemes?.[0]?.type;
const anonymousTools = tools.filter((tool) => schemeOf(tool) === "noauth");
const scopedTools = tools.filter((tool) => schemeOf(tool) === "oauth2");
assert(anonymousTools.length === 11 && scopedTools.length === 37, "MCP security schemes are not 11 noauth plus 37 oauth2.");
assert(
  anonymousTools.every((tool) => tool.annotations?.readOnlyHint === true),
  "Every anonymous MCP tool must be read-only.",
);
const toolNames = new Set(tools.map((tool) => tool.name));
for (const requiredTool of [
  "search",
  "fetch",
  "list_comments",
  "admin_moderate_comment",
  "admin_newsletter_send_campaign",
  "admin_newsletter_process_outbox",
  "admin_social_enqueue",
  "admin_social_requeue",
  "admin_social_process_outbox",
]) {
  assert(toolNames.has(requiredTool), `MCP is missing ${requiredTool}.`);
}

const found = await rpc("tools/call", { name: "search", arguments: { query: "agents" } });
const [hit] = found.payload.result.structuredContent.results;
assert(hit && /^https?:\/\//.test(hit.url), "search returned no absolute article URL.");
const document = await rpc("tools/call", { name: "fetch", arguments: { id: hit.id } });
assert(document.payload.result.structuredContent.text.startsWith("# "), "fetch did not return the article as Markdown.");

const unsigned = await rpc("tools/call", {
  name: "admin_create_article",
  arguments: {
    locale: "en",
    title: "Runtime anonymous write refusal",
    excerpt: "An anonymous caller must be sent to sign in instead of writing.",
    content: "This anonymous write must be refused with a sign-in challenge and must never reach the newsroom store.",
    categorySlug: "research",
  },
});
assert(unsigned.payload.result.isError === true, "An anonymous write was not refused.");
assert(
  unsigned.payload.result._meta?.["mcp/www_authenticate"]?.[0]?.includes("resource_metadata"),
  "The refused write carries no sign-in challenge.",
);
const denied = await rpc("tools/list", {}, "Bearer not-the-key");
assert(denied.response.status === 401, "MCP accepted an invalid bearer token.");
assert(denied.response.headers.get("www-authenticate")?.startsWith("Bearer"), "The 401 has no Bearer challenge.");

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

// The MCP process and the site are separate processes. They share articles only through
// Supabase, so site delivery and cache invalidation are checked when the site runs in that mode.
const sharedStore = healthBody.contentMode === "supabase";

const published = await callAdmin("admin_publish_article", { id, locale: "en", confirm: true });
assert(published.article.status === "published", "Article was not published.");
const read = await rpc("tools/call", { name: "get_article", arguments: { locale: "en", slug } });
assert(read.payload.result.isError !== true, "The published article is not readable anonymously over MCP.");
if (sharedStore) {
  const delivered = await get(`/en/articles/${slug}`, 200);
  assert((await delivered.text()).includes("Runtime MCP lifecycle verification"), "Published page is stale.");
}

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
const unread = await rpc("tools/call", { name: "get_article", arguments: { locale: "en", slug } });
assert(unread.payload.result.isError === true, "The deleted article is still readable over MCP.");
if (sharedStore) {
  const gone = await get(`/en/articles/${slug}`, 404);
  assert(!(await gone.text()).includes("Runtime MCP lifecycle verification"), "Deleted article remains cached.");
}

console.log(JSON.stringify({
  routes: 19,
  health: { status: 503, contentMode: healthBody.contentMode },
  mcpTools: { total: tools.length, anonymous: anonymousTools.length, scoped: scopedTools.length },
  knowledgeSource: ["search", "fetch"],
  revalidate: revalidateSecret ? "authorised" : "rejects-without-secret",
  articleLifecycle: ["create", "publish", "mcp-read", ...(sharedStore ? ["public-200"] : []), "delete", ...(sharedStore ? ["public-404"] : [])],
  studio: ["dashboard", "articles", "distribution", "media", "newsletter", "csv"],
}));
