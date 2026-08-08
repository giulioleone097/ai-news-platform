# Model Context Protocol

NEURA exposes published editorial content as a stateless, read-only MCP server over Streamable HTTP.

## Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/mcp/info` | `GET` | Human- and machine-readable server metadata |
| `/api/mcp` | `POST` | MCP JSON-RPC over Streamable HTTP |
| `/api/mcp` | `OPTIONS` | CORS preflight |

`GET /api/mcp` intentionally returns 405. Use the info route for discovery and POST for protocol requests.

Protocol version: `2025-11-25`. Responses are JSON; clients should still advertise both JSON and event-stream support.

## Required headers

```text
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25
```

The server is stateless and does not issue an MCP session ID. Every call is independently retryable when the tool annotation marks it idempotent.

## Initialize

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2025-11-25' \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-11-25",
      "capabilities":{},
      "clientInfo":{"name":"curl","version":"1.0.0"}
    }
  }'
```

## List tools

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

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
  --header 'MCP-Protocol-Version: 2025-11-25' \
  --data '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"list_articles",
      "arguments":{"locale":"en","category":"research","limit":5}
    }
  }'
```

Pass the returned `nextCursor` unchanged as `cursor` for the next page. Do not decode or construct cursors in clients.

### Search

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_articles","arguments":{"locale":"en","query":"agents","limit":5}}}'
```

### Get one article

```bash
curl --request POST "$SITE/api/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_article","arguments":{"locale":"en","slug":"ai-agents-enter-everyday-work"}}}'
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

Do not add mutation tools to this public server. A future editorial MCP surface must use a separate authenticated endpoint, explicit authorization per tool, audit logging, and non-destructive defaults.

## Error behavior

- Invalid JSON-RPC or arguments: protocol error with a non-2xx or tool error result.
- Missing localized article: tool error, no cross-language fallback.
- Upstream repository unavailable: bounded generic error; database details are not exposed.
- Unsupported HTTP method: 405 with `Allow: POST, OPTIONS`.

Production checks should assert both the HTTP status and the JSON-RPC `error`/`isError` fields.
