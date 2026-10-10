# Model Context Protocol

AtlasNews exposes one stateless Streamable HTTP endpoint, `POST /mcp`, served by the standalone `apps/mcp` process (`npm run start -w apps/mcp`, port `PORT`, default `8787`). Anonymous callers read published content and approved comments. A signed-in editor also gets the newsroom tools. OpenAI allows one MCP server for each plugin, so both live behind the same URL and the caller's token decides what runs.

## Where tools are defined

Every data capability is defined once, in `packages/contract` (`@atlasnews/contract`): name, title, description, zod input and output, the four annotation hints, required scopes, surfaces, an optional confirmation question, an optional UI resource, and the handler. Adapters read that catalogue and declare nothing of their own:

- `apps/mcp/src/adapter.ts` registers every capability whose surfaces include `mcp`. It is the only generic `registerTool` call. `/info` and `tools/list` derive from the same list.
- `@atlasnews/contract/page` is the browser-safe view for capabilities whose surfaces include `page`: plain data (name, title, description, JSON Schema of the input, annotations). It imports no handler, use case or Node API, and a test enforces that. The site registers these as WebMCP tools.
- The MCP Apps entrypoints (`open_newsroom`, `open_news_panel`, `build_briefing`, `search_mentions`) are MCP Apps specific and stay in `apps/mcp/src/apps`.

To add a capability: define a spec in `packages/contract/src/specs`, implement it in `packages/contract/src/handlers`, and add it to the list there. The MCP endpoint, `/info` and the tests pick it up.

## Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/mcp` | `POST` | MCP JSON-RPC over Streamable HTTP, anonymous or with a Bearer token |
| `/mcp` | `OPTIONS` | CORS preflight |
| `/info` | `GET` | Machine-readable server metadata, derived from the catalogue |
| `/.well-known/oauth-protected-resource` | `GET` | RFC 9728 resource metadata that the Bearer challenge points at |

`GET /mcp` returns 405. `/mcp/admin` no longer exists. Below, `$MCP` is the base URL of `apps/mcp` (`http://localhost:8787` locally).

Current protocol version: `2026-07-28`, served by the stable MCP TypeScript server SDK v2. Ordinary modern responses are JSON and protocol streams can upgrade to SSE. Stateless 2025-era clients (`initialize` with `2025-11-25`) are served through the SDK's `legacy: "stateless"` path and may receive SSE.

## Required headers

```text
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
MCP-Method: <JSON-RPC method>
MCP-Name: <tool name, required for tools/call>
```

Every modern request also carries the protocol version, client information and client capabilities in `params._meta`. The server is stateless and issues no session ID.

## Discover and list tools

```bash
curl --request POST "$MCP/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/list' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

Use `MCP-Method: server/discover` with `method: "server/discover"` for the server identity and capabilities. `tools/list` returns all 48 tools to every caller, so a host can find the editor tools and start sign-in. Each tool carries all four annotation hints and its security scheme in `_meta.securitySchemes`.

## Authentication

The caller is resolved once per request from the `Authorization` header:

| Header | Caller | Result |
| --- | --- | --- |
| none | anonymous | read tools work; scoped tools return a sign-in error |
| `Bearer <valid token>` | editor with the token's scopes | tools inside those scopes run |
| anything else | rejected | HTTP 401 with `WWW-Authenticate: Bearer realm="atlasnews", resource_metadata="…", error="invalid_token"` |

Token checking sits behind the `AccessTokenVerifier` port (`apps/mcp/src/auth.ts`). Today the only verifier is the shared API key `NEURA_MCP_ADMIN_API_KEY` (at least 32 characters, constant-time comparison), which maps to one editor with every scope. An OAuth JWT verifier plugs into the same port later and needs no change to tools or adapters.

Scopes:

| Scope | Allows |
| --- | --- |
| `newsroom.read` | Admin reads: drafts, moderation queue, subscriber data, campaigns, social outbox, previews |
| `newsroom.write` | Create and update articles, workflow, media and drafts; moderate comments; queue, requeue, cancel and retry social jobs; cancel campaigns |
| `newsroom.publish` | Publish and delete articles and media; send or schedule campaigns; erase subscribers; process any outbox (anything that emails or posts externally) |

A tool declares `[{ "type": "noauth" }]` or `[{ "type": "oauth2", "scopes": [...] }]` in `_meta.securitySchemes`. Calling a scoped tool without the scope returns a tool error (not data) with `_meta["mcp/www_authenticate"]` holding a Bearer challenge with `error="insufficient_scope"` and the `scope` it needs. That is OpenAI's documented trigger for account linking. The challenge's `resource_metadata` points at `/.well-known/oauth-protected-resource`, which lists the scopes; `authorization_servers` is added once an OAuth verifier is configured.

Responses to a signed-in editor are `Cache-Control: no-store` and carry no CORS headers. Anonymous responses keep today's CORS behaviour: `*` unless `MCP_ALLOWED_ORIGINS` is set. `Authorization` is not in the allowed preflight headers, so browsers cannot call the editor tools cross-origin.

## Tools

Anonymous (`noauth`, read-only, idempotent, closed-world):

| Tool | Required arguments | Optional arguments | Result |
| --- | --- | --- | --- |
| `search` | `query` (2–160 chars) | None | `{results:[{id,title,url}]}` across both languages; the standard ChatGPT knowledge-source tool |
| `fetch` | `id` (from `search`, such as `en/some-slug`) | None | `{id,title,text,url,metadata}` with the article as Markdown |
| `list_articles` | None | `locale=en`, `category`, `limit=10` (1–25), `cursor` | Published article summaries and opaque `nextCursor` |
| `search_articles` | `query` (2–160 chars) | `locale=en`, `limit=10` (1–25) | Matching published summaries; also a page tool |
| `get_article` | `slug` | `locale=en` | Full published article and public author metadata |
| `list_categories` | None | `locale=en` | Localized categories |
| `list_comments` | `slug` | `locale=en`, `parentId`, `limit=12` (1–24), `cursor` | Approved top-level comments or replies and opaque `nextCursor` |
| `build_briefing` | None | `locale=en`, `topics`, `storiesPerTopic=3` (1–5) | Latest stories by topic; asks through an OpenAI form when `topics` is omitted and the host supports it |
| `open_newsroom`, `open_news_panel` | None | `locale=en`, `category` | App-only ChatGPT sidebar and conversation-panel entrypoints |
| `search_mentions` | `query` (may be empty) | None | App-only composer mention search returning article resource links |

`search` and `fetch` follow OpenAI's knowledge-source shapes (developers.openai.com/api/docs/mcp): the result object is returned as `structuredContent` and as the JSON string in `content[0].text`, and `url` is an absolute link built from `NEXT_PUBLIC_SITE_URL`, which ChatGPT uses for citations.

Editor tools (`oauth2`), all names unchanged from the former `/mcp/admin` server:

| Scope | Tools |
| --- | --- |
| `newsroom.read` | `admin_list_articles`, `admin_get_article`, `admin_list_categories`, `admin_list_distribution`, `admin_list_newsletter_subscriptions`, `admin_list_media`, `admin_list_comments`, `admin_list_comment_reports`, `admin_list_comment_audit`, `admin_newsletter_list_campaigns`, `admin_newsletter_get_campaign`, `admin_newsletter_list_recipients`, `admin_social_preview`, `admin_social_list`, `admin_social_get` |
| `newsroom.write` | `admin_create_article`, `admin_update_article`, `admin_update_distribution`, `admin_update_newsletter_subscription`, `admin_upload_media`, `admin_moderate_comment`, `admin_newsletter_save_campaign_draft`, `admin_newsletter_cancel_campaign`, `admin_social_enqueue`, `admin_social_requeue`, `admin_social_cancel`, `admin_social_retry` |
| `newsroom.publish` | `admin_publish_article`, `admin_delete_article`, `admin_delete_media`, `admin_comment_process_notifications`, `admin_newsletter_send_campaign`, `admin_newsletter_schedule_campaign`, `admin_newsletter_request_subscription`, `admin_newsletter_erase_subscription`, `admin_newsletter_process_outbox`, `admin_social_process_outbox` |

Production persistence for the editor tools additionally requires `SUPABASE_SERVICE_ROLE_KEY` and `NEURA_MCP_ADMIN_AUTHOR_ID`. In demo mode (no Supabase, outside production) the editorial tools work on the in-memory repository; comment moderation, newsletter and social tools answer with a generic "not configured" tool error. Generate the API key with `openssl rand -hex 32` and rotate it on both ends together.

Supported locales are `en` and `it`; English is the default.

## Confirmation

Tools that publish, delete, email or post externally ask before they run: `admin_publish_article`, `admin_delete_article`, `admin_delete_media`, `admin_moderate_comment`, `admin_comment_process_notifications`, all newsletter send, schedule, cancel, request, erase and process tools, and all social enqueue, requeue, cancel, retry and process tools.

- Hosts that support MRTR forms (MCP `2026-07-28` plus `elicitation.form`) get an `input_required` result with a confirmation form. With the `openai/elicitation` extension the schema travels in `_meta` like the briefing form; without it the form is a plain core form. The tool runs only after the user accepts. A form-capable host is always asked, even when the arguments already say `confirm: true`.
- Other hosts keep the argument: without `confirm: true` the tool answers with an error and does nothing. The description of each such tool says so.

The `confirm` argument is optional in the advertised schema (it used to be a required `true`). Queueing never sends inline, and workers use leases and idempotency before calling providers.

## Resources, MCP Apps and events

- `ui://atlasnews/newsroom-v1.html` is an MCP Apps UI resource (`text/html;profile=mcp-app`). `list_articles`, `search_articles`, `get_article`, `build_briefing` and both entrypoints render it in hosts that support MCP Apps.
- `atlasnews://articles/{locale}/{slug}` returns a published article as Markdown; a miss answers `-32602` with `data.uri`.
- `server/discover` advertises `extensions["openai/mentions"]` and, when service-role persistence is configured, the `events` capability for `article.published`.

[OPENAI_EXTENSIONS.md](OPENAI_EXTENSIONS.md) maps every OpenAI extension and the MCP Events contract to this implementation.

## Cache invalidation

The MCP process cannot purge the reader site's Next cache directly. After an editorial write it calls `POST {NEXT_PUBLIC_SITE_URL}/api/revalidate` with `Authorization: Bearer $NEURA_REVALIDATE_SECRET` and `{ "locale": "en", "slugs": ["…"] }`. The route compares the secret in constant time and answers 503 to everyone when `NEURA_REVALIDATE_SECRET` (at least 32 characters) is unset on the site. Set the same value on both processes. Without it on the MCP process the call is skipped, and a failed call never fails the edit; the site then refreshes on its own revalidate windows. The two processes share articles only through Supabase, so the demo in-memory store of one is not visible to the other.

## Client configuration

For clients that accept remote HTTP servers, use the canonical HTTPS endpoint:

```json
{
  "mcpServers": {
    "atlasnews": {
      "type": "http",
      "url": "https://mcp.news.example.com/mcp"
    }
  }
}
```

Clients that sign in send the token as `Authorization: Bearer …`; the repository-local plugin under `plugins/` is documented in [AGENT_PLUGIN.md](AGENT_PLUGIN.md).

## Error behavior

- Invalid JSON-RPC or arguments: protocol error or a tool error result (`Input validation error`).
- Missing localized article: tool error, no cross-language fallback.
- Missing scope: tool error with `_meta["mcp/www_authenticate"]`; invalid token: HTTP 401.
- Upstream repository unavailable: bounded generic tool error; database details are not exposed.
- Unsupported HTTP method: 405 with `Allow: POST, OPTIONS`.

Production checks should assert both the HTTP status and the JSON-RPC `error` and `isError` fields.
