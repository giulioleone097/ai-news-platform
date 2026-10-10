# OpenAI plugin extensions and MCP Events

This maps OpenAI's [plugin extensions](https://developers.openai.com/plugins/build/extensions) ([spec](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)) and [MCP Events](https://developers.openai.com/plugins/build/mcp-events) guides to the AtlasNews MCP server at `/mcp`. Everything here is standard MCP 2026-07-28 plus MCP Apps, so the same server and UI also work in Claude and other MCP Apps hosts; the `openai/*` metadata is ignored elsewhere.

## Status

| Extension | Status | Where |
| --- | --- | --- |
| Sidebar app (global entrypoint) | Done: `open_newsroom`, titled "AtlasNews", accepts `{}` | `apps/mcp/src/apps/entrypoints.ts` |
| Conversation panel (thread entrypoint) | Done: `open_news_panel`, "AI news beside chat" | same |
| Entrypoint icon | Done: 20×20 stroke SVG on the tools and in `serverInfo.icons` | `public/mcp/neura-icon.svg` |
| Display modes | Done: `inline` and `fullscreen`, inline preferred for model calls; opening a story from an inline card requests fullscreen | `apps/ui-resource.ts`, `apps/newsroom-client.ts` |
| Deep links | Done: `/articles/{locale}/{slug}`, `/categories/{locale}/{slug}`, `/search?q=…&locale=…` | `apps/widget-helpers.ts` |
| Extended model context | Done: "Add to chat" attaches a titled article with its cover as thumbnail; the current view goes as hidden `audience: ["assistant"]` context; host removals clear the state | `apps/newsroom-client.ts` |
| Extended message sending | Done: "Ask about this" sends to the active chat; "Discuss in a new chat" opens an editable draft (`target: "new", send: false`) when the host advertises `openai/message` | same |
| Composer mentions | Done: `openai/mentions` capability with app-only `search_mentions`; results are `atlasnews://articles/{locale}/{slug}` resource links | `apps/mentions.ts`, `apps/article-resources.ts` |
| Extended forms | Done: `build_briefing` asks for topics (multi-select with cover thumbnails and descriptions), language and depth through an MRTR `input_required` form; falls back to all topics when the host lacks `elicitation.form` plus `openai/elicitation.form` | `apps/briefing.ts` |
| Plugin onboarding | Done: `extensions.com.openai.onboardingSkill` → `skills/onboarding/SKILL.md` | `plugins/neura-ai-news` |
| MCP Events | Done: `article.published`, filterable by `locale`, `category`, `entity` and `claim_status`, webhook delivery with callback verification and Standard Webhooks signatures | `packages/core/src/mcp-events`, `packages/adapters/src/mcp-events`, `apps/mcp/src/events` |
| Knowledge source | Done: standard `search` and `fetch` tools (`search({query})` returns `{results:[{id,title,url}]}`, `fetch({id})` returns `{id,title,text,url,metadata}` with the article as Markdown and an absolute URL). Shapes follow developers.openai.com/api/docs/mcp | `packages/contract/src/specs/public.ts` |
| One server per plugin | Done: `/mcp/admin` is gone. Anonymous callers read; editors with a Bearer token also get the 37 newsroom tools on the same endpoint | `apps/mcp/src/auth.ts`, `docs/MCP.md` |
| Per-tool security schemes | Done: every tool has `_meta.securitySchemes` (`noauth`, or `oauth2` with its scopes). A scoped tool called without the scope returns a tool error with `_meta["mcp/www_authenticate"]`, the documented trigger for account linking (developers.openai.com/apps-sdk/build/auth). The SDK has no top-level `securitySchemes` field on a tool, so only the `_meta` mirror is emitted | `apps/mcp/src/adapter.ts` |
| OAuth 2.1 sign-in | Not built: the only verifier is the shared API key. The `AccessTokenVerifier` port, the scopes and the resource-metadata route are ready for a JWT verifier | `apps/mcp/src/auth.ts` |
| Confirmation forms | Done: tools that publish, delete, email or post ask through an MRTR form on hosts that support it and keep `confirm: true` elsewhere | `apps/mcp/src/confirmation.ts` |
| Plugin settings | Not built: needs a per-user identity to persist settings (see decisions) | — |
| File viewers and editors | Not built: AtlasNews has no file type users open from disk | — |

The app calls only the server's public catalogue tools (`list_articles`, `search_articles`, `get_article`, `list_categories`), so the UI adds no second data API to keep in sync with MCP.

## MCP Events

- `server/discover` advertises `events: {}` only when `SUPABASE_SERVICE_ROLE_KEY` is configured; otherwise no event methods are registered.
- Subscriptions are public data on an anonymous server, so identity is `sha256(canonical {principal: "public", url, name, arguments})`. Abuse limits: HTTPS callbacks only, DNS resolved and checked against private, loopback, link-local, CGNAT, multicast and documentation ranges at connect time, no redirects, 5 s verification and 10 s delivery timeouts, 256 KiB bodies, at most 25 live subscriptions per callback host, TTL 1 h to 30 days (7 days default, never unlimited).
- Every new or re-pointed subscription must echo a signed, single-use verification challenge before activation; successful verification is cached for 24 h per callback URL and secret.
- The `/internal/mcp-events` worker (`apps/jobs`) (every minute) enqueues articles published after each subscription's checkpoint (never backfills), then sends due deliveries with leases, stable `evt_` IDs, fresh signatures per attempt, exponential backoff, no retry on 410/413, and deactivation on 410.
- No replay: `cursor` is always `null` and `truncated` is `false`.
- Tables `mcp_event_subscriptions` and `mcp_event_deliveries` are service-role only (RLS forced, no client policies). Signing secrets are stored as received because each delivery must be signed with them.

## Testing in ChatGPT

1. Deploy over HTTPS and set `NEXT_PUBLIC_SITE_URL`; image URLs and the CSP `resourceDomains` derive from it (plus the Supabase origin when configured).
2. Apply the migration, set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`, and confirm the per-minute cron runs.
3. Connect `https://<mcp-host>/mcp` in ChatGPT developer mode, then rescan after every tool or event change.
4. Check: AtlasNews appears in the sidebar; the panel opens in a chat; `@` finds articles on desktop; "Build my AI news briefing" shows the form; the plugin page lists `article.published`; a subscription in a Work chat receives a newly published article. ChatGPT desktop needs version 26.928.20710 or later for these APIs.

## Open decisions

- **Plugin settings** need per-user persistence. Decided in the redesign: OAuth tokens come from Supabase Auth (`auth.type: "mixed"` keeps anonymous reading), built by the redesign rather than here; settings can then hold language, topics and alert defaults.
- **MCP on its own subdomain** (redesign decision): nothing here assumes the MCP shares the reader site's origin. Links, images, the icon, the `search` and `fetch` URLs and the CSP `resourceDomains` all derive from `NEXT_PUBLIC_SITE_URL`, so set it to the reader site on the MCP deployment. The sign-in challenge derives its `resource_metadata` URL from the MCP request's own origin.
- **Brand** (decided: AtlasNews): the stable identifiers in the MCP server are renamed (server `atlasnews`, `ui://atlasnews/newsroom-v1.html`, `atlasnews://articles/...`). Still to rename outside it: the `neura-ai-news` plugin package, the icon file `public/mcp/neura-icon.svg` and the `NEURA_` environment variables. Do it before the plugin is first published, because hosts store these.
- **Portable manifest**: OpenAI now prefers a root `plugin.json` with `extensions.com.openai` and a root `mcp.json`. The repository keeps the Codex compatibility overlay, which is still supported; migrating is a packaging change for the redesign.
- **Publishing** to the ChatGPT directory needs the production URL and an OpenAI developer account, and OAuth 2.1 sign-in for the editor tools (the API key cannot be linked through the portal). With one server per plugin, the review sees the anonymous read tools plus tools that need an account.
