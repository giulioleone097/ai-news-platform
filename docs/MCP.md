# Model Context Protocol

NEURA exposes two stateless Streamable HTTP servers: a public read-only surface for published content and a separate API-key-protected newsroom surface for editorial operations.

## Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/mcp/info` | `GET` | Human- and machine-readable server metadata |
| `/api/mcp` | `POST` | MCP JSON-RPC over Streamable HTTP |
| `/api/mcp` | `OPTIONS` | CORS preflight |
| `/api/mcp/admin` | `POST` | Authenticated newsroom MCP JSON-RPC |

`GET /api/mcp` intentionally returns 405. Use the info route for discovery and POST for protocol requests.

Current protocol version: `2026-07-28`, served by the stable MCP TypeScript server SDK v2. Ordinary modern responses are JSON and protocol streams can upgrade to SSE. Stateless 2025-era clients remain supported and may receive SSE.

## Required headers

```text
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
MCP-Method: <JSON-RPC method>
MCP-Name: <tool name, required for tools/call>
```

Use `MCP-Protocol-Version: 2026-07-28`. Every modern request also carries the protocol version, client information, and client capabilities in `params._meta`.

The server is stateless and does not issue an MCP session ID. Every call is independently retryable when the tool annotation marks it idempotent.

## Discover

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: server/discover' \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"server/discover",
    "params":{
      "_meta":{
        "io.modelcontextprotocol/protocolVersion":"2026-07-28",
        "io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},
        "io.modelcontextprotocol/clientCapabilities":{}
      }
    }
  }'
```

The result advertises `supportedVersions`, capabilities, and server identity. Modern MCP does not use the legacy initialize handshake.

## List tools

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/list' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

Legacy clients using `initialize` with `2025-11-25` are routed through the SDK's stateless compatibility path. New clients should always use `server/discover` and the per-request metadata envelope above.

## Tools

| Tool | Required arguments | Optional arguments | Result |
| --- | --- | --- | --- |
| `list_articles` | None | `locale=en`, `category`, `limit=10` (1–25), `cursor` | Published article summaries and opaque `nextCursor` |
| `search_articles` | `query` (2–160 chars) | `locale=en`, `limit=10` (1–25) | Matching published summaries |
| `get_article` | `slug` | `locale=en` | Full published article and public author metadata |
| `list_categories` | None | `locale=en` | Localized categories |

Supported locales are `en` and `it`; English is the default. All tools are read-only, non-destructive, idempotent, and closed-world.

### List articles

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/call' \
  --header 'MCP-Name: list_articles' \
  --data '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"list_articles",
      "arguments":{"locale":"en","category":"research","limit":5},
      "_meta":{
        "io.modelcontextprotocol/protocolVersion":"2026-07-28",
        "io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},
        "io.modelcontextprotocol/clientCapabilities":{}
      }
    }
  }'
```

Pass the returned `nextCursor` unchanged as `cursor` for the next page. Do not decode or construct cursors in clients.

### Search

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/call' \
  --header 'MCP-Name: search_articles' \
  --data '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_articles","arguments":{"locale":"en","query":"agents","limit":5},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

### Get one article

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/call' \
  --header 'MCP-Name: get_article' \
  --data '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_article","arguments":{"locale":"en","slug":"ai-agents-enter-everyday-work"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

## Client configuration

For clients that accept remote HTTP servers, use the canonical HTTPS endpoint:

```json
{
  "mcpServers": {
    "neura": {
      "type": "http",
      "url": "https://news.example.com/api/mcp"
    }
  }
}
```

The exact configuration envelope is client-specific; the endpoint and transport are standard MCP Streamable HTTP.

## Access and CORS

- Authentication: none.
- Data scope: published articles and public categories only.
- `MCP_ALLOWED_ORIGINS`: optional comma-separated browser-origin allow-list.
- Empty allow-list: wildcard CORS for a deliberately public read surface.
- Non-browser agents normally omit `Origin` and remain supported.
- Responses use `Cache-Control: no-store`; clients decide their own bounded caching.

Do not add mutation tools to this public server. Editorial mutations live only on the separate authenticated endpoint below.

## Authenticated newsroom server

`POST /api/mcp/admin` requires `Authorization: Bearer <NEURA_MCP_ADMIN_API_KEY>`. It has no browser CORS surface and authenticates before parsing the body or resolving the service-role repository. Missing or incorrect credentials return `401`; missing server configuration returns `503`.

The server exposes:

| Tool | Purpose |
| --- | --- |
| `admin_list_articles` | List drafts, review, scheduled, and published articles by locale |
| `admin_get_article` | Read one complete newsroom article by ID and locale |
| `admin_list_categories` | Read valid categories for a locale |
| `admin_create_article` | Create an article, defaulting safely to draft |
| `admin_update_article` | Patch selected fields of an existing article |
| `admin_publish_article` | Publish an existing article immediately |
| `admin_delete_article` | Permanently delete after `confirm: true` |

Production persistence additionally requires `SUPABASE_SERVICE_ROLE_KEY` and `NEURA_MCP_ADMIN_AUTHOR_ID`. All three values are server-only. Generate the API key with `openssl rand -hex 32`, store it in Vercel secrets and the authorized client environment, and rotate both ends together.

The repository-local plugin under `plugins/neura-ai-news` configures both servers for Codex/OpenAI, Claude Code, and GitHub Copilot CLI. See [AGENT_PLUGIN.md](AGENT_PLUGIN.md).

## Error behavior

- Invalid JSON-RPC or arguments: protocol error with a non-2xx or tool error result.
- Missing localized article: tool error, no cross-language fallback.
- Upstream repository unavailable: bounded generic error; database details are not exposed.
- Unsupported public HTTP method: 405 with `Allow: POST, OPTIONS`; the admin endpoint allows only `POST`.

Production checks should assert both the HTTP status and the JSON-RPC `error`/`isError` fields.
