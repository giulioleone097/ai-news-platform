# OpenAI plugin extensions and MCP Events

This maps OpenAI's [plugin extensions](https://developers.openai.com/plugins/build/extensions) ([spec](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)) and [MCP Events](https://developers.openai.com/plugins/build/mcp-events) guides to the AtlasNews MCP server at `/mcp`. Everything here is standard MCP 2026-07-28 plus MCP Apps, so the same server and UI also work in Claude and other MCP Apps hosts; the `openai/*` metadata is ignored elsewhere.

## Status

| Extension | Status | Where |
| --- | --- | --- |
| Sidebar app (global entrypoint) | Done: `open_newsroom`, titled "AtlasNews", accepts `{}` | `apps/mcp/src/apps/entrypoints.ts` |
| Conversation panel (thread entrypoint) | Done: `open_news_panel`, "AI news beside chat" | same |
| Entrypoint icon | Done: 20×20 SVG on the tools and in `serverInfo.icons` | `public/mcp/atlasnews-icon.svg` |
| Display modes | Done: `inline` and `fullscreen`, inline preferred for model calls; opening a story from an inline card requests fullscreen | `apps/ui-resource.ts`, `apps/newsroom-client.ts` |
| Deep links | Done: `/articles/{locale}/{slug}`, `/categories/{locale}/{slug}`, `/search?q=…&locale=…` | `apps/widget-helpers.ts` |
| Extended model context | Done: "Add to chat" attaches a titled article with its cover as thumbnail; the current view goes as hidden `audience: ["assistant"]` context; host removals clear the state | `apps/newsroom-client.ts` |
| Extended message sending | Done: "Ask about this" sends to the active chat; "Discuss in a new chat" opens an editable draft (`target: "new", send: false`) when the host advertises `openai/message` | same |
| Composer mentions | Done: `openai/mentions` capability with app-only `search_mentions`; results are `atlasnews://articles/{locale}/{slug}` resource links | `apps/mentions.ts`, `apps/article-resources.ts` |
| Extended forms | Done: `build_briefing` asks for topics (multi-select with cover thumbnails and descriptions), language and depth through an MRTR `input_required` form; falls back to all topics when the host lacks `elicitation.form` plus `openai/elicitation.form` | `apps/briefing.ts` |
| Plugin onboarding | Done: `extensions.com.openai.onboardingSkill` → `skills/onboarding/SKILL.md` | `plugins/atlasnews` |
| MCP Events | Done: `article.published`, filterable by `locale`, `category`, `entity` and `claim_status`, webhook delivery with callback verification and Standard Webhooks signatures | `packages/core/src/mcp-events`, `packages/adapters/src/mcp-events`, `apps/mcp/src/events` |
| Knowledge source | Done: standard `search` and `fetch` tools (`search({query})` returns `{results:[{id,title,url}]}`, `fetch({id})` returns `{id,title,text,url,metadata}` with the article as Markdown and an absolute URL). Shapes follow developers.openai.com/api/docs/mcp | `packages/contract/src/specs/public.ts` |
| One server per plugin | Done: `/mcp/admin` is gone. Anonymous callers read; editors with a Bearer token also get the newsroom tools on the same endpoint | `apps/mcp/src/auth.ts`, `docs/MCP.md` |
| Per-tool security schemes | Done: every tool has `_meta.securitySchemes` (`noauth`, or `oauth2` with its scopes). A scoped tool called without the scope returns a tool error with `_meta["mcp/www_authenticate"]`, the documented trigger for account linking (developers.openai.com/apps-sdk/build/auth). The SDK has no top-level `securitySchemes` field on a tool, so only the `_meta` mirror is emitted | `apps/mcp/src/adapter.ts` |
| OAuth 2.1 sign-in | Done: Supabase Auth is the authorization server (dynamic client registration, PKCE S256, no CIMD, no RFC 9207 `iss`), `apps/mcp` is the resource server (JWKS-verified ES256/RS256 access tokens, editor profile decides the newsroom scopes). The plugin declares `auth.type: "mixed"` with `client.mode: "dcr"`. [MCP.md](MCP.md#sign-in-with-supabase-auth) has the flow and the limits | `apps/mcp/src/auth/`, `plugins/atlasnews/mcp.json` |
| Confirmation forms | Done: tools that publish, delete, email or post ask through an MRTR form on hosts that support it and keep `confirm: true` elsewhere | `apps/mcp/src/confirmation.ts` |
| Plugin settings | Not built: needs a per-user identity to persist settings (see decisions) | — |
| File viewers and editors | Not built: AtlasNews has no file type users open from disk | — |

The app calls only the server's public catalogue tools (`list_articles`, `search_articles`, `get_article`, `list_categories`), so the UI adds no second data API to keep in sync with MCP.

## MCP Events

- `server/discover` advertises `events: {}` only when a server-side store exists (the D1 database on Sites, `SUPABASE_SERVICE_ROLE_KEY` self-hosted); otherwise no event methods are registered.
- Subscribing makes this server call an address the caller chose, so it needs a signed-in caller (any account, not only an editor): an anonymous `events/subscribe` is answered `401` with a Bearer challenge, which is what starts account linking in ChatGPT. Listing the events stays anonymous. Identity is `sha256(canonical {principal: <subject>, url, name, arguments})`, so two accounts never share a subscription, and nothing below asks ChatGPT for more than the guide describes (a `whsec_` secret, a callback that answers the signed challenge, `ttlMs`, a refresh before `refreshBefore`). Abuse limits: HTTPS callbacks only, DNS resolved and checked against private, loopback, link-local, CGNAT, multicast and documentation ranges at connect time, no redirects, 5 s verification and 10 s delivery timeouts, 256 KiB bodies, TTL 1 h to 30 days (7 days default, never unlimited), and the caps in [Abuse limits](#abuse-limits).
- Every new or re-pointed subscription must echo a signed, single-use verification challenge before activation; successful verification is cached for 24 h per callback URL and secret.
- The `/internal/mcp-events` worker (`apps/jobs`) (every minute) enqueues articles published after each subscription's checkpoint (never backfills), then sends due deliveries with leases, stable `evt_` IDs, fresh signatures per attempt, exponential backoff, no retry on 410/413, and deactivation on 410.
- No replay: `cursor` is always `null` and `truncated` is `false`.
- Tables `mcp_event_subscriptions` and `mcp_event_deliveries` are service-role only (RLS forced, no client policies). Signing secrets are stored as received because each delivery must be signed with them.

### Abuse limits

| Limit | Default | Setting | What it stops |
| --- | --- | --- | --- |
| Live subscriptions per signed-in account | 20 | `ATLASNEWS_MCP_EVENTS_MAX_PER_PRINCIPAL` | one account filling the table (counted in the store, so it holds across Worker isolates) |
| Live subscriptions per callback hostname | 25 | `ATLASNEWS_MCP_EVENTS_MAX_PER_HOST` | one receiver filling the table |
| Live subscriptions per registrable domain (the last two labels, three below `co.uk`-style suffixes; not the Public Suffix List) | 100 | `ATLASNEWS_MCP_EVENTS_MAX_PER_DOMAIN` | wildcard DNS, which gives one owner unlimited hostnames |
| Live subscriptions in total | 1000 | `ATLASNEWS_MCP_EVENTS_MAX_SUBSCRIPTIONS` | exhausting the delivery capacity of the worker |
| `events/subscribe` calls per minute per signed-in account | 30 | `ATLASNEWS_MCP_EVENTS_SUBSCRIBES_PER_MINUTE` | using the server as a generator of outbound verification requests; HTTP 429 with `Retry-After` |

A refresh of a live subscription does not count against the four caps, so ChatGPT's renewals keep working when the table is full. The subscribe limit counts every call, including those whose verification fails (which store nothing, so the caps cannot see them). It is keyed by the account, not by the network, so it needs no `ATLASNEWS_CLIENT_IP_HEADER`. Its counters are in memory, per `apps/mcp` process. **ChatGPT may call from a few shared addresses and may deliver every callback from one host**: if real subscriptions are refused (`subscription_limit` or 429), raise the settings rather than disable them.

Delivery order: each minute the worker serves the 100 live subscriptions with the oldest checkpoint, and serving one moves its checkpoint forward, so with up to 1000 subscriptions each is reached within ten minutes (the previous order, by creation time, served the same first 100 forever). Concurrent subscribes can overshoot a cap by a few.

### Ownership and re-keying

A subscription belongs to the account that created it: `events/unsubscribe` carries only the event name, arguments and callback URL, and is resolved under the caller's own account, so another account cannot stop it. What is enforced:

- A subscription can only be created or refreshed by presenting a callback that answers a verification challenge signed with the presented secret. A caller who knows a victim's URL but not the receiver's secret cannot create or re-key anything for it, and a new secret on a live subscription is always verified again (never taken from the 24-hour verification cache), so an old or leaked secret cannot be put back unchecked. The previous secret signs deliveries for one more hour, as the guide asks for rotation.
- Residual risk: an account that learns the callback URL, event name and arguments of another account's subscription cannot unsubscribe it, but can create its own subscription for the same callback. That still needs the receiver's secret to answer the verification challenge.

## Testing in ChatGPT

1. Deploy over HTTPS and set `NEXT_PUBLIC_SITE_URL`; image URLs and the CSP `resourceDomains` derive from it (plus the Supabase origin when configured). On ChatGPT Sites the Site's own address is used.
2. On Sites there is no cron to set up: the Worker runs the due jobs after requests, and `CRON_SECRET` is only for an external schedule ([SITES.md](SITES.md)). Self-hosted, apply the Supabase migrations, set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`, and confirm the per-minute cron runs.
3. Connect `https://<site>/mcp` (self-hosted: `https://<mcp-host>/mcp`) in ChatGPT developer mode, then rescan after every tool or event change.
4. Check: AtlasNews appears in the sidebar; the panel opens in a chat; `@` finds articles on desktop; "Build my AI news briefing" shows the form; the plugin page lists `article.published`; a subscription in a Work chat receives a newly published article. ChatGPT desktop needs version 26.928.20710 or later for these APIs.

## Open decisions

- **Plugin settings** need per-user persistence, which now has an identity (the signed-in Supabase user) but no table or tool. Not built.
- **MCP path or subdomain** (decided: `/mcp` on the Site): on ChatGPT Sites the MCP server is the path `/mcp` of the Site's own origin, served by the same Worker. Nothing in the server needs that, though: a self-hosted `apps/mcp` may sit on its own host. Links, images, the icon, the `search` and `fetch` URLs and the CSP `resourceDomains` all derive from `NEXT_PUBLIC_SITE_URL`, so set it to the reader site on a separate MCP deployment. The sign-in challenge derives its `resource_metadata` URL from the MCP request's own origin.
- **Brand** (decided: AtlasNews): the server, the plugin (`atlasnews`), the icon, the environment variables (`ATLASNEWS_*`) and the resource URIs (`ui://atlasnews/newsroom-v1.html`, `atlasnews://articles/...`) carry the name. Hosts store these identifiers, so they must not change after the plugin is first published.
- **Portable manifest**: done. `plugins/atlasnews` has a root `plugin.json` with `extensions.com.openai` and a root `mcp.json`, plus the Claude files. The legacy `.codex-plugin/plugin.json` is gone: OpenAI documents it only as a fallback when the inline `extensions.com.openai` object is absent. [AGENT_PLUGIN.md](AGENT_PLUGIN.md) lists the rules and `pnpm plugin:check` enforces them.
- **Publishing** to the ChatGPT directory needs what `pnpm plugin:release` lists (production URLs, listing pages, licence, demo recording), an OpenAI developer account with a verified publisher and global data residency, the domain-verification token served at `/.well-known/openai-apps-challenge` on the MCP origin (`apps/mcp` serves it from `ATLASNEWS_OPENAI_APPS_CHALLENGE`, see [HOSTING.md](HOSTING.md); the owner sets the token), and `_meta.ui.domain` on the UI resource (not set yet). The review sees the anonymous read tools plus tools that need an account, so it needs an editor test account.
