# Model Context Protocol

AtlasNews exposes one stateless Streamable HTTP endpoint, `POST /mcp`, served by the standalone `apps/mcp` process (`pnpm --filter @atlasnews/mcp start`, port `PORT`, default `8787`). Anonymous callers read published content and approved comments. A signed-in editor also gets the newsroom tools. OpenAI allows one MCP server for each plugin, so both live behind the same URL and the caller's token decides what runs.

## Where tools are defined

Every data capability is defined once, in `packages/contract` (`@atlasnews/contract`): name, title, description, zod input and output, the four annotation hints, required scopes, surfaces, an optional confirmation question, an optional UI resource, and the handler. Adapters read that catalogue and declare nothing of their own:

- `apps/mcp/src/adapter.ts` registers every capability whose surfaces include `mcp`. It is the only generic `registerTool` call. `/info` and `tools/list` derive from the same list.
- `@atlasnews/contract/page` is the browser-safe view of the tools of the open page: plain data (name, title, description, JSON Schema of the input, annotations). It imports no handler, use case or Node API, and a test enforces that. The reader site registers five of them as WebMCP tools and the Studio three (open the article editor, read the form, fill a draft; [SITE_TOOLS.md](SITE_TOOLS.md)). They work on the page, so every data and operation tool stays on MCP and no WebMCP tool has the name of an MCP tool, except the reader's `search_articles`, which takes the MCP tool's name, text and input. The Studio's own Server Actions run the capabilities with the `studio` surface; workers (comment-notification, newsletter and social outbox processing) and newsletter erasure are MCP-only.
- The MCP Apps entrypoints (`open_newsroom`, `open_news_panel`, `build_briefing`, `search_mentions`) are MCP Apps specific and stay in `apps/mcp/src/apps`.

To add a capability: define a spec in `packages/contract/src/specs`, implement it in `packages/contract/src/handlers`, and add it to the list there. The MCP endpoint, `/info` and the tests pick it up.

## Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/mcp` | `POST` | MCP JSON-RPC over Streamable HTTP, anonymous or with a Bearer token |
| `/mcp` | `OPTIONS` | CORS preflight |
| `/info` | `GET` | Machine-readable server metadata, derived from the catalogue |
| `/.well-known/oauth-protected-resource` | `GET` | RFC 9728 resource metadata that the Bearer challenge points at; names the authorization server. 404 while no OAuth server is configured (on Sites, in demo mode, or without the variables below) |

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

A `POST` without `MCP-Protocol-Version` is answered `400` with JSON-RPC error `-32000` (the same status the SDK gives a wrong value), which lists the supported versions. The one exception is `initialize`, which opens the connection that fixes the version and cannot carry it. A client older than the 2025-06-18 transport, which never sent the header, is therefore refused; set it to the version negotiated at `initialize`.

`tools/list` and `resources/list` answer with cache hints (`ttlMs` 300000 and 60000, `cacheScope` `private`) to a client that speaks `2026-07-28`; the SDK adds nothing for 2025-era clients.

## Discover and list tools

```bash
curl --request POST "$MCP/mcp" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/list' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

Use `MCP-Method: server/discover` with `method: "server/discover"` for the server identity and capabilities. `tools/list` returns every tool to every caller (`apps/mcp/src/mcp-endpoint.test.ts` pins the count), so a host can find the editor tools and start sign-in. Each tool carries all four annotation hints and its security scheme in `_meta.securitySchemes`.

## Authentication

The caller is resolved once per request from the `Authorization` header:

| Header | Caller | Result |
| --- | --- | --- |
| none | anonymous | read tools, `tools/list` and discovery work; a `tools/call` for a scoped tool is answered with HTTP 401 and a Bearer challenge (below) |
| `Bearer <valid token>` | editor with the token's scopes | tools inside those scopes run |
| anything else | rejected | HTTP 401 with `WWW-Authenticate: Bearer realm="atlasnews", resource_metadata="…", error="invalid_token"` |

Token checking sits behind the `AccessTokenVerifier` port (`apps/mcp/src/auth.ts`). Two verifiers are tried in this order:

1. **Supabase OAuth access tokens** (`apps/mcp/src/auth/`), when sign-in is configured (see [Sign-in](#sign-in-with-supabase-auth)). The signature is checked against the project's JWKS (cached ten minutes; an unknown `kid` reloads it, at most every 30 seconds, so a rotated key is picked up), then issuer, audience, expiry and not-before. Only ES256 and RS256 are accepted; `alg: none` and HS256 are refused. The token must carry a `client_id` claim, which only the OAuth server sets, so an ordinary Studio session token cannot be replayed here. The subject must have a `public.profiles` row with role `editor` or `admin` (read with the service-role key, answers cached 30 seconds); it then gets every newsroom scope, and its `author_id` is carried on the principal. A valid token for anyone else is accepted as a caller with no newsroom scope, so scoped tools answer with the sign-in error.
2. **The shared API key** `ATLASNEWS_MCP_ADMIN_API_KEY` (at least 32 characters, constant-time comparison), for the CI smoke and the self-hosted CLI. It maps to one editor with every scope, `newsroom.admin` included, so treat it like an admin credential.

If the key set or the profile table cannot be reached the request fails with HTTP 500, not 401, so a host does not discard a good token during an outage.

Scopes:

| Scope | Allows |
| --- | --- |
| `newsroom.read` | Admin reads: drafts, moderation queue, subscriber data, campaigns, social outbox, previews |
| `newsroom.write` | Create and update articles, workflow, media and drafts; moderate comments; queue, requeue, cancel and retry social jobs; cancel campaigns |
| `newsroom.publish` | Publish and delete articles and media; send or schedule campaigns; erase subscribers; process any outbox (anything that emails or posts externally) |
| `newsroom.admin` | Manage the team: list, invite, change the role of and remove editors. Granted to the `admin` role only (`scopesForRole`); an editor's sign-in gets the three scopes above |

A tool declares `[{ "type": "noauth" }]` or `[{ "type": "oauth2", "scopes": [...] }]` in `_meta.securitySchemes`. What happens when a scoped tool is called without the scope depends on who calls:

- **Anonymous caller: HTTP 401, before the SDK runs.** Claude starts sign-in only on a real `401` with `WWW-Authenticate: Bearer resource_metadata="…"`, which a tool handler cannot produce (whatever it returns is wrapped in a `200`). OpenAI's apps SDK accepts the same challenge. `handleMcpRequest` therefore decides in `apps/mcp/src/http.ts`, from the already-read request body, whether the request would run a tool whose capability has scopes, and answers `401` with `Bearer realm="atlasnews", resource_metadata="…", error="invalid_token", error_description="Authentication required for this tool", scope="…"` (the scopes of the called tools, or the ones Supabase can grant). The 401 carries the public CORS headers, since it reveals nothing but the metadata URL, and `WWW-Authenticate` is in `Access-Control-Expose-Headers`.
- **Signed-in caller without the scope (such as a user with no editor profile): HTTP 200 with a tool error**, not data, whose `_meta["mcp/www_authenticate"]` holds a Bearer challenge with `error="insufficient_scope"` and the `scope` it needs. That is OpenAI's tool-level trigger for account linking, and a fresh `401` would only loop a host that already holds a token.

How the gate reads a request: the JSON-RPC body is what the SDK executes, so every `tools/call` in it counts, for 2026-07-28 and 2025-era requests alike and for each message of a batch. The `MCP-Name` header (2026-07-28 requests carry `MCP-Method` and `MCP-Name`) can only add to that, never lower it: if the header names a scoped tool the request is challenged even when the body says otherwise, and the other way round. A body that is not JSON contributes nothing and the SDK rejects it. `initialize`, `server/discover`, `tools/list`, resources, the events methods and anonymous tools never reach the gate. The body is read once (limit 256 KiB, `413` above it, before any parsing) and the SDK receives that same body.

The challenge's `resource_metadata` points at `/.well-known/oauth-protected-resource`, which lists `authorization_servers` (Supabase Auth). The challenge carries it, and the route answers, only once sign-in is configured; otherwise there is no metadata to point at and the route answers 404.

Supabase Auth cannot grant custom scopes; it rejects an authorization request for a scope it does not define. The `newsroom.*` scopes are therefore a server-side decision taken from the profile role (`scopesForRole` in `apps/mcp/src/auth/editors.ts`, the only place), and with sign-in configured the metadata, the challenges and `_meta.securitySchemes` offer hosts only the scopes Supabase grants (`email`). Without sign-in configured they show the `newsroom.*` scopes as before.

Responses to a signed-in editor are `Cache-Control: no-store` and carry no CORS headers. `Authorization` is not in the allowed preflight headers, so browsers cannot call the editor tools cross-origin.

**Origin.** The transport requires a server to validate `Origin`. Every request that carries one (`POST`, `OPTIONS`, `GET`) is checked against the allow list and a foreign origin is answered `403` with JSON-RPC error `-32003`, before the body is read. The list is `MCP_ALLOWED_ORIGINS` when set, otherwise the site's own origin (`NEXT_PUBLIC_SITE_URL`), `https://chatgpt.com` and `https://claude.ai`. A request without `Origin` (a CLI, a server, the plugin) is not a browser's and is not checked. Anonymous responses to an allowed origin echo it in `Access-Control-Allow-Origin` with `Vary: Origin`; there is no `*`. The CORS headers name neither `MCP-Session-Id` nor `Last-Event-ID`, which the 2026-07-28 transport does not have.

## Sign-in on ChatGPT Sites

On Sites (`ATLASNEWS_CONTENT_MODE=sites`) the MCP server runs inside the Site's Worker at `https://<site>/mcp`, and the platform is the authorization server: `hosting.json` declares the `mcp` capability, Sites runs the OAuth flow for MCP clients and forwards the signed-in account as the `oai-authenticated-user-*` headers, as it does for the site. `resolveSitesPrincipal` (`apps/mcp/src/auth.ts`) maps that account to its editor row (`packages/adapters/src/sites/editors.ts`, [SITES.md](SITES.md#sign-in-and-editors)) and the role to scopes with the same `scopesForRole`; an account without an editor row is a caller with no newsroom scope. The Bearer challenge then carries no `resource_metadata`, `/.well-known/oauth-protected-resource` answers 404, none of the Supabase variables below apply, and no revalidation call is needed because the site and the server share one Worker and one D1 database. `resolvePrincipal` reads only the identity headers there and never looks at `Authorization`, so `ATLASNEWS_MCP_ADMIN_API_KEY` is ignored on Sites: a script has no credential of its own, and the editor tools are reachable only through the platform's sign-in. `ATLASNEWS_CHATGPT_SIGN_IN=off` ignores the headers too, which leaves `/mcp` anonymous ([SITES.md](SITES.md#sign-in-and-editors)). Run the probe in [GO_LIVE.md](GO_LIVE.md#before-the-site-is-public-the-identity-probe) before the Site is public.

`events/subscribe` makes the server call an address the caller chose, so it needs a signed-in caller: an anonymous one is answered `401` with a Bearer challenge, and a signed-in reader (an account without an editor row, so without newsroom scopes) may subscribe. Listing the events stays anonymous. Each account may hold 20 live subscriptions (`ATLASNEWS_MCP_EVENTS_MAX_PER_PRINCIPAL`), counted in the store, so the cap holds across Worker isolates.

## Sign-in with Supabase Auth

Supabase Auth is the OAuth 2.1 authorization server; `apps/mcp` is only the resource server. Editors are the `auth.users` that have an editor or admin `public.profiles` row ([DEPLOYMENT.md](DEPLOYMENT.md), "Bootstrap the first editor").

```text
host -> POST /mcp without token         -> tools/list and public tools answer; a scoped tools/call answers 401 + WWW-Authenticate
host -> GET  /.well-known/oauth-protected-resource   -> authorization_servers[0] = https://<ref>.supabase.co/auth/v1
host -> GET  <issuer>/.well-known/openid-configuration (or oauth-authorization-server)
host -> POST <issuer>/oauth/clients/register          (dynamic registration, once per host)
host -> browser: <issuer>/oauth/authorize?...&code_challenge_method=S256&resource=<mcp url>
Supabase -> browser: <site>/oauth/consent?authorization_id=...     (apps/web/src/app/oauth/consent)
editor signs in, sees which application asks, allows or cancels
Supabase -> host redirect with ?code=...  ->  POST <issuer>/oauth/token  ->  access token (ES256 JWT) + refresh token
host -> POST /mcp with Authorization: Bearer <access token>
```

What Supabase gives and does not give (checked against `supabase.com/docs/guides/auth/oauth-server` and the `supabase/auth` source, v2.197):

| Topic | Supabase Auth |
| --- | --- |
| Enable | Dashboard, Authentication, OAuth Server; locally `[auth.oauth_server]` in `supabase/config.toml` (`enabled`, `authorization_url_path`, `allow_dynamic_registration`) |
| Endpoints | `/auth/v1/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/.well-known/jwks.json`; discovery at `/auth/v1/.well-known/openid-configuration`, `/auth/v1/.well-known/oauth-authorization-server`, and on the hosted platform `/.well-known/oauth-authorization-server/auth/v1` |
| Registration | Pre-registered clients (dashboard, OAuth Apps) and dynamic registration (`registration_endpoint`, public, rate limited). No Client ID Metadata Documents |
| PKCE | Mandatory; `S256` and `plain` accepted (`plain` is advertised too) |
| `resource` (RFC 8707) | Validated (absolute URI, no fragment or query) and bound to the authorization code, but **not copied into `aud`**: the access token `aud` stays `authenticated` |
| `iss` response parameter (RFC 9207) | **Not returned**, and `authorization_response_iss_parameter_supported` is not advertised |
| Scopes | Only `openid`, `profile`, `email`, `phone`, `offline_access`; custom scopes are not supported. Default `email` |
| Token | ES256 or RS256 JWT with `sub`, `role`, `aud`, `iss`, `client_id`, `scope`, `session_id`; lifetime `jwt_expiry` (default 3600 s); refresh tokens rotate (`offline_access` accepted) |
| Keys | JWKS lists asymmetric public keys only. A project still on the legacy HS256 secret has an empty JWKS: migrate to asymmetric signing keys first (a local stack from CLI 2.117 already has an ES256 key) |
| Consent | The app must host the consent page (`authorization_url_path`), see below |
| Revocation | No RFC 7009 endpoint. A user revokes a client's grant (`auth.oauth.revokeGrant`), which deletes its refresh tokens; an issued access token stays valid until it expires |

The consent page is `apps/web/src/app/oauth/consent`, in English and Italian (chosen from `Accept-Language`). A visitor who is not signed in sees a sign-in form (email and password, the same Supabase call as the Studio login) and returns to the same request. A signed-in editor sees the application's name, the host it returns to (prominent, under the name), the permissions, and chooses Allow or Cancel; an account without an editor profile can only cancel. It calls `getAuthorizationDetails`, then `approveAuthorization` or `denyAuthorization`, and redirects to the URL Supabase returns. Set Authorization Path to `/oauth/consent` and the Site URL to the web origin in the dashboard.

### Hosts

| Host | Registers as | Redirect URI |
| --- | --- | --- |
| Claude (claude.ai, Desktop, mobile) | Dynamic registration | `https://claude.ai/api/mcp/auth_callback` |
| Claude Code | Dynamic registration | `http://localhost/callback`, `http://127.0.0.1/callback` (port ignored) |
| ChatGPT | Dynamic registration, or a client pre-registered in the dashboard | `https://chatgpt.com/connector/oauth/{callback_id}` (copy it from the connector page). The stable `connector_platform_oauth_redirect` needs RFC 9207 `iss`, which Supabase does not send |

Anyone can register a client when dynamic registration is on, and a client can choose any name and any redirect URI, so a phishing site can ask a signed-in editor to approve "Claude". Three layers answer that:

1. **Redirect host allowlist (always on, `apps/web`).** The consent decision re-reads the request from Supabase and refuses to approve unless the redirect URI is HTTPS on an allowed host (or HTTP on loopback). The default is `claude.ai`, `claude.com`, `chatgpt.com`, `localhost`, `127.0.0.1` and `[::1]`; `ATLASNEWS_OAUTH_REDIRECT_HOSTS` replaces it (exact hosts, or `*.example.com`). A request for any other host shows a warning and no Allow button, and an earlier approval is not followed automatically to such a host. The page puts that host in large type under the application's name, which the application chooses itself. A host with a custom URL scheme (some desktop editors) is not covered by the default: add its callback host, or use a loopback redirect.
2. **Client allowlist (required, `apps/mcp`).** `ATLASNEWS_MCP_OAUTH_CLIENT_IDS` lists the OAuth client ids whose tokens the verifier accepts; a token from any other client is a 401. While it is empty the server offers no OAuth at all (no verifier, no `resource_metadata`, metadata 404), and `/api/health` reports `mcp-oauth-client-ids` as not ready (set the variable on `apps/web` too), because accepting every client of the project would let anyone who registers one be approved by an editor.
3. **No dynamic registration in production.** Pre-register the hosts you use in the dashboard (OAuth Apps), turn `allow_dynamic_registration` off (`supabase/config.toml` locally, Authentication, OAuth Server in the dashboard), put the registered client ids in `ATLASNEWS_MCP_OAUTH_CLIENT_IDS`, and review the client list regularly.

The local `supabase/config.toml` keeps dynamic registration on so that Claude and ChatGPT can be tried without setup.

### Environment

| Variable | Used by | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `apps/mcp`, `apps/web` | Sign-in is on when all three are set (the service role key, at least 32 characters, reads the editor profile). The issuer is `<url>/auth/v1` and the key set `<issuer>/.well-known/jwks.json`. Unset means no OAuth: only the API key |
| `NEXT_PUBLIC_MCP_URL` | `apps/mcp`, `apps/web` | Public origin of the MCP server (`https://mcp.news.example.com`). **Required for sign-in**: without it `apps/mcp` offers no OAuth (only the API key), because the `resource` in the challenge and in the publicly cached metadata would otherwise come from the request's Host header, which a caller chooses. It must be the exact URL hosts were given, which behind a proxy the request URL seen by Node is not. `apps/web` links to it from the footer |
| `ATLASNEWS_MCP_OAUTH_CLIENT_IDS` | `apps/mcp`, `apps/web` | **Required for sign-in.** Comma-separated OAuth client ids whose tokens are accepted. Empty means no OAuth, and `/api/health` lists `mcp-oauth-client-ids` as an issue (`apps/web` reads it for that) |
| `ATLASNEWS_OAUTH_REDIRECT_HOSTS` | `apps/web` | Optional comma-separated hosts a client may return the editor to; replaces the default (`claude.ai`, `claude.com`, `chatgpt.com`, loopback) |
| `ATLASNEWS_CLIENT_IP_HEADER` | `apps/web` | Optional name of the one trusted client-address header, used for the per-network limits of comments and newsletter requests, see [DEPLOYMENT.md](DEPLOYMENT.md#client-address-and-rate-limits) |
| `ATLASNEWS_MCP_OAUTH_ISSUER` | `apps/mcp` | Optional. Issuer when it differs from `<url>/auth/v1`, such as a Supabase custom domain |
| `ATLASNEWS_MCP_OAUTH_AUDIENCE` | `apps/mcp` | Optional. Required `aud`. Unset accepts `authenticated`. Set it to the MCP URL once a custom access token hook sets that audience (below) |
| `ATLASNEWS_MCP_ADMIN_API_KEY`, `ATLASNEWS_MCP_ADMIN_AUTHOR_ID` | `apps/mcp` | The API key path. Its writes are attributed to `ATLASNEWS_MCP_ADMIN_AUTHOR_ID`; a signed-in editor's are attributed to their own `author_id` |
| `ATLASNEWS_REVALIDATE_SECRET` | `apps/mcp`, `apps/web` | Shared secret (at least 32 characters, the same value on both) for cache invalidation after a write, see [Cache invalidation](#cache-invalidation) |

The sign-in variables are listed in `.env.example`, with the app that reads each.

Because `aud` is `authenticated` and the `resource` is not bound to it, a token that Supabase issued to another client of the same project is accepted here if its subject is an editor. The `client_id` requirement keeps ordinary session tokens out, but only a custom access token hook closes the gap: for tokens that carry `client_id`, return `aud` set to the MCP URL, then set `ATLASNEWS_MCP_OAUTH_AUDIENCE` to the same value.

### Verify a deployment

1. `curl https://<ref>.supabase.co/auth/v1/.well-known/openid-configuration`: `registration_endpoint` is present when dynamic registration is on, and `jwks_uri` returns at least one key.
2. `curl $MCP/.well-known/oauth-protected-resource`: `resource` is exactly the URL you give hosts, and `authorization_servers[0]` is the issuer.
3. Call a scoped tool without a token (`tools/call` with `admin_list_articles`): HTTP 401 with `WWW-Authenticate: Bearer … resource_metadata="…"`. Call a public tool or `tools/list` without a token: HTTP 200. Call any tool with a made-up bearer: HTTP 401 with `error="invalid_token"`.
4. Add the connector in Claude (Settings, Connectors, URL `$MCP/mcp`) and in ChatGPT (developer mode, same URL). Sign in as an editor on the consent page, ask for `admin_list_articles`, then a write, and check that the article's author is the signed-in editor.
5. Sign in as a user without an editor profile: the consent page offers only Cancel; a token obtained another way sees only the anonymous tools.
6. Revoke the grant, then wait for `jwt_expiry`: the access token stops working.

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

Editor tools (`oauth2`), all names unchanged from the former `/mcp/admin` server, plus the content tools added since:

| Scope | Tools |
| --- | --- |
| `newsroom.read` | `admin_list_articles`, `admin_get_article`, `admin_list_categories`, `admin_get_category`, `admin_get_entity`, `admin_list_distribution`, `admin_list_newsletter_subscriptions`, `admin_list_contact_messages`, `admin_list_media`, `admin_get_media`, `admin_get_newsletter_subscription`, `admin_get_contact_message`, `admin_list_comments`, `admin_get_comment`, `admin_list_comment_reports`, `admin_list_comment_audit`, `admin_newsletter_list_campaigns`, `admin_newsletter_get_campaign`, `admin_newsletter_list_recipients`, `admin_social_preview`, `admin_social_list`, `admin_social_get` |
| `newsroom.write` | `admin_create_article`, `admin_update_article`, `admin_create_articles`, `admin_update_articles`, `admin_create_category`, `admin_update_category`, `admin_create_categories`, `admin_update_categories`, `admin_create_entity`, `admin_update_entity`, `admin_create_entities`, `admin_update_entities`, `admin_upload_media`, `admin_upload_media_assets`, `admin_update_distribution`, `admin_update_newsletter_subscription`, `admin_update_contact_message`, `admin_update_contact_messages`, `admin_delete_contact_message`, `admin_delete_contact_messages`, `admin_moderate_comment`, `admin_moderate_comments`, `admin_newsletter_save_campaign_draft`, `admin_newsletter_update_campaign_draft`, `admin_newsletter_delete_campaign_draft`, `admin_newsletter_cancel_campaign`, `admin_social_enqueue`, `admin_social_update`, `admin_social_requeue`, `admin_social_cancel`, `admin_social_cancel_jobs`, `admin_social_retry` |
| `newsroom.admin` | `admin_list_editors`, `admin_invite_editor`, `admin_update_editor`, `admin_remove_editor` |
| `newsroom.publish` | `admin_publish_article`, `admin_unpublish_article`, `admin_publish_articles`, `admin_unpublish_articles`, `admin_delete_article`, `admin_delete_articles`, `admin_delete_category`, `admin_delete_categories`, `admin_delete_entity`, `admin_delete_entities`, `admin_delete_media`, `admin_delete_media_assets`, `admin_comment_process_notifications`, `admin_newsletter_send_campaign`, `admin_newsletter_schedule_campaign`, `admin_newsletter_request_subscription`, `admin_newsletter_erase_subscription`, `admin_newsletter_process_outbox`, `admin_social_process_outbox` |

### Content management

Articles, categories, entities and media each have the same verbs. Entities are listed by the anonymous `list_entities`.

| Content | Read | Create | Patch | Delete | Batch |
| --- | --- | --- | --- | --- | --- |
| Article | `admin_list_articles` (filters `status`, `category`, `entity`, `claimStatus`, `query`), `admin_get_article` | `admin_create_article` | `admin_update_article` | `admin_delete_article` | `admin_create_articles`, `admin_update_articles`, `admin_delete_articles`, `admin_publish_articles`, `admin_unpublish_articles` |
| Category | `admin_list_categories`, `admin_get_category` | `admin_create_category` | `admin_update_category` | `admin_delete_category` | `admin_create_categories`, `admin_update_categories`, `admin_delete_categories` |
| Entity | `list_entities`, `admin_get_entity` | `admin_create_entity` | `admin_update_entity` | `admin_delete_entity` | `admin_create_entities`, `admin_update_entities`, `admin_delete_entities` |
| Media | `admin_list_media`, `admin_get_media` | `admin_upload_media` | none: assets are immutable files | `admin_delete_media` | `admin_upload_media_assets`, `admin_delete_media_assets` |

The other content types have the verbs their rules allow, and `packages/contract/src/catalogue.test.ts` holds the matrix, with the reason for every gap:

| Content | Read | Create | Patch | Delete | Batch |
| --- | --- | --- | --- | --- | --- |
| Comment | `admin_list_comments`, `admin_get_comment` | readers write them | `admin_moderate_comment` (status only) | none: comments are moderated, never erased | `admin_moderate_comments` |
| Contact message | `admin_list_contact_messages`, `admin_get_contact_message` | visitors write them | `admin_update_contact_message` | `admin_delete_contact_message` | `admin_update_contact_messages`, `admin_delete_contact_messages` |
| Newsletter subscriber | `admin_list_newsletter_subscriptions`, `admin_get_newsletter_subscription` | `admin_newsletter_request_subscription` | `admin_update_newsletter_subscription` | `admin_newsletter_erase_subscription` | none |
| Newsletter campaign | `admin_newsletter_list_campaigns`, `admin_newsletter_get_campaign` | `admin_newsletter_save_campaign_draft` | `admin_newsletter_update_campaign_draft` (drafts only) | `admin_newsletter_delete_campaign_draft` (drafts only) | none |
| Social job | `admin_social_list`, `admin_social_get` | `admin_social_enqueue` | `admin_social_update` (pending only) | `admin_social_cancel` (the job stays as a record) | `admin_social_cancel_jobs` |

Publishing is its own pair: `admin_publish_article` and `admin_unpublish_article` (the batches above).

- **Create and patch cannot publish.** `status` accepts `draft`, `review` and `scheduled` only. A published article keeps its status when patched; going live and coming back go through the publish tools, which need `newsroom.publish` and ask for confirmation. Core enforces this (`ArticleCommandService.create/patch`), and the SQL batch function repeats it.
- **PATCH.** A field you leave out keeps its stored value; the tool descriptions say what an explicit value clears. Articles: `scheduledFor: null` removes the date, and empty `distribution`, `keyPoints`, `sources` or `entities` lists empty them; title, slug, excerpt, content, `categorySlug`, cover and `claimStatus` are replaced, never cleared. Categories: `description: ""` clears; name, slug and position are replaced. Entities: `null` clears `officialUrl`, `parentSlug` and a locale's description; name and kind are replaced. A patch with no field is refused.
- **Bilingual content.** A category is created with both locales (`translations.en` and `translations.it`, each with `name`, optional `slug` and `description`) under one translation key, which is the English slug and never changes; patches name the locales they touch. `admin_list_categories` returns each category in the requested locale with its `position` and both locales under `translations` (the shape of `admin_get_category`), so one call lists everything an editor screen needs. An entity is one row with an optional description per locale (`descriptions.en`, `descriptions.it`); its slug is its handle and is never renamed. Slugs are lowercase kebab-case, derived from the name when omitted, and unique per locale (entities: globally).
- **Delete rules.** A category used by any article, an entity linked to any story or that is the company of other entities, and a media asset used as an article cover are refused with a clear error. A company can be deleted in the same call as its own models and products.
- **Batches** take 1 to 25 items (media: 1 to 10). They are all or nothing: every item is checked first and every invalid item is reported by index (`#2 (slug): reason`) with nothing written; the write is then one database transaction (`save_articles_batch`, `publish_articles_batch`, `delete_articles_batch`, `create_categories_batch`, `update_categories_batch`, `delete_categories_batch`, `create_entities_batch`, `update_entities_batch`, `delete_entities_batch`), so a database failure halfway leaves nothing behind. Media storage is not a database: a failed batch upload removes the images already stored. A result is `{ count, items: [{ index, action, id | slug | translationKey | path, ... }] }` in request order.
- **Untrusted visitor text.** `list_comments`, `admin_list_comments`, `admin_get_comment`, `admin_list_comment_reports`, `admin_list_newsletter_subscriptions`, `admin_get_newsletter_subscription`, `admin_list_contact_messages`, `admin_get_contact_message` and `admin_newsletter_list_recipients` return text that anonymous visitors wrote. Their results carry `contentTrust: { source: "anonymous-visitors", untrustedFields: [...], instruction }` and their descriptions say to treat those fields as data, never as instructions.
- **Browser page.** No tool above is a WebMCP tool: an agent in the editor's browser has MCP for data and operations and WebMCP for the open page only (`open_article_editor`, `read_article_form`, `fill_article_form`). Every content, comment, inbox, newsletter, social and team tool above (and `list_entities`) has the surfaces `mcp` and `studio`; the outbox workers and `admin_newsletter_erase_subscription` only `mcp`.

### Contact inbox

Visitors write to the newsroom through the form on `/{locale}/support` (`POST /api/contact`). The messages sit in the same store as the other records and reach editors in the Studio (`/{locale}/studio/inbox`) and here: `admin_list_contact_messages` (newest first, filters `status`, `cursor`, `limit`; the name, address, subject and text are visitor content, marked untrusted), `admin_get_contact_message` (one message by id), `admin_update_contact_message` (`new`, `handled` or `archived`; it sends no reply) and `admin_delete_contact_message` (asks first). `admin_update_contact_messages` and `admin_delete_contact_messages` do the same for 1 to 25 ids at once, all or nothing.

### Team

An admin manages who can sign in to the newsroom: `admin_list_editors` (address, role, `invited` or `active`), `admin_invite_editor` (`email`, optional `role` editor or admin, optional `name` shown on their articles), `admin_update_editor` (`id`, `role`) and `admin_remove_editor` (`id`; destructive hint and the usual confirmation). All four need `newsroom.admin`, which only the `admin` role has, so an editor's token is refused with the missing scope in the error. They share one definition with the Studio's Team page (`/{locale}/studio/team`) and the page tools; the rules live in `packages/core/src/team`: a valid address, a role of editor or admin, no address twice, the last active admin is never demoted or removed, and an admin cannot remove themselves. Removing revokes access only: the person's author and articles stay, and on Supabase the Auth user stays too. `admin_invite_editor` returns `emailSent`: on Supabase the person gets an invitation email; on ChatGPT Sites none is sent, so tell them to sign in with that address ([SITES.md](SITES.md#sign-in-and-editors)). On Sites an address listed in `ATLASNEWS_ADMIN_EMAILS` or `ATLASNEWS_EDITOR_EMAILS` is created again at its next sign-in, so removing it also needs the list edited.

Supported locales are `en` and `it`; English is the default.

## Confirmation

Tools that publish, delete, email or post externally ask before they run: `admin_publish_article`, `admin_unpublish_article`, `admin_publish_articles`, `admin_unpublish_articles`, `admin_delete_article`, `admin_delete_articles`, `admin_delete_category`, `admin_delete_categories`, `admin_delete_entity`, `admin_delete_entities`, `admin_delete_media`, `admin_delete_media_assets`, `admin_remove_editor`, `admin_moderate_comment`, `admin_moderate_comments`, `admin_delete_contact_message`, `admin_delete_contact_messages`, `admin_comment_process_notifications`, all newsletter send, schedule, cancel, request, erase, draft delete and process tools, and all social enqueue, update, requeue, cancel, cancel-many, retry and process tools.

- Hosts that support MRTR forms (MCP `2026-07-28` plus `elicitation.form`) get an `input_required` result with a confirmation form. With the `openai/elicitation` extension the schema travels in `_meta` like the briefing form; without it the form is a plain core form. The tool runs only after the user accepts. A form-capable host is always asked, even when the arguments already say `confirm: true`.
- Other hosts keep the argument: without `confirm: true` the tool answers with an error and does nothing. The description of each such tool says so.

The `confirm` argument is optional in the advertised schema (it used to be a required `true`). Queueing never sends inline, and workers use leases and idempotency before calling providers.

## Resources, MCP Apps and events

- `ui://atlasnews/newsroom-v1.html` is an MCP Apps UI resource (`text/html;profile=mcp-app`). `list_articles`, `search_articles`, `get_article`, `build_briefing` and both entrypoints render it in hosts that support MCP Apps.
- `atlasnews://articles/{locale}/{slug}` returns a published article as Markdown; a miss answers `-32602` with `data.uri`. A repository failure answers `-32603 Articles are temporarily unavailable.`, never the database's error text (anonymous callers read this).
- `server/discover` advertises `extensions["openai/mentions"]` and, when service-role persistence is configured, the `events` capability for `article.published`.

[OPENAI_EXTENSIONS.md](OPENAI_EXTENSIONS.md) maps every OpenAI extension and the MCP Events contract to this implementation.

## Cache invalidation

The MCP process cannot purge the reader site's Next cache directly. After an editorial write it calls `POST {NEXT_PUBLIC_SITE_URL}/api/revalidate` with `Authorization: Bearer $ATLASNEWS_REVALIDATE_SECRET` and `{ "locale": "en", "slugs": ["…"] }`. The route compares the secret in constant time and answers 503 to everyone when `ATLASNEWS_REVALIDATE_SECRET` (at least 32 characters) is unset on the site. Set the same value on both processes. Without it on the MCP process the call is skipped, and a failed call never fails the edit; the site then refreshes on its own revalidate windows. The two processes share articles only through Supabase, so the demo in-memory store of one is not visible to the other.

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

Clients that sign in (see [Sign-in](#sign-in-with-supabase-auth)) send the token as `Authorization: Bearer …`; the repository-local plugin under `plugins/` is documented in [AGENT_PLUGIN.md](AGENT_PLUGIN.md).

## Error behavior

- Invalid JSON-RPC or arguments: protocol error or a tool error result (`Input validation error`).
- Missing localized article: tool error, no cross-language fallback.
- Scoped tool called anonymously, or an invalid token: HTTP 401 with a Bearer challenge. Signed in without the scope: tool error with `_meta["mcp/www_authenticate"]`.
- Upstream repository unavailable: bounded generic tool error; database details are not exposed.
- Unsupported HTTP method: 405 with `Allow: POST, OPTIONS`.

Production checks should assert both the HTTP status and the JSON-RPC `error` and `isError` fields.
