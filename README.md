# AtlasNews

An English-first, internationalized AI news platform. The default deployment is **ChatGPT Sites**: one Worker built from `apps/web` serves the reader site, the Studio, the MCP server at `/mcp` and the background jobs, with the Site's own D1 database and R2 bucket for records and uploads, and Sign in with ChatGPT (optionally Google and GitHub) for editors. It needs no Supabase. **Supabase is the optional self-host deployment** for leaving Sites: Postgres, Storage and Auth, with the MCP server and the workers as containers. AtlasNews includes a zero-configuration editorial preview; every operational write, notification, campaign and social publication uses real persisted adapters and fails closed when its provider is not configured.

## What ships

- English-first routes with Italian content parity: `/en` and `/it`.
- Editorial home, infinite latest/category/search feeds, article pages, localized RSS, native social sharing, bookmarks and deferred comments.
- Persisted comment threads with signed guest identity, own-edit/delete windows, reports, moderation audit, rate limits and real email notifications.
- Double-opt-in newsletter, Markdown campaigns, recipient snapshots, scheduling, Resend delivery, signed webhooks, suppression, unsubscribe and erasure.
- Real LinkedIn, X and WhatsApp publishing through leased, idempotent outboxes (D1 on Sites, Supabase when self-hosted) with retry/read-back.
- Persistent content with full-text search, editorial roles, translations, consent registries and immutable media: D1 and R2 on Sites, or Supabase Postgres (row-level security) and Storage when self-hosted. Both implement the same core ports.
- One stateless MCP endpoint, `POST /mcp`, on the same origin as the site (the Site's own `/mcp` on Sites; the standalone `apps/mcp` when self-hosted): anonymous callers read published stories and approved comments; editors who sign in (the platform's sign-in on Sites, OAuth 2.1 with Supabase Auth self-hosted) also get the newsroom tools. Every tool is defined once in `packages/contract`.
- ChatGPT and Claude app surface on the public MCP: an MCP Apps newsroom UI, ChatGPT sidebar and side-panel entrypoints, deep links, composer @-mentions, a native-form briefing, article resources and MCP Events webhooks for newly published articles. See [OPENAI_EXTENSIONS.md](docs/OPENAI_EXTENSIONS.md).
- Studio (`/{locale}/studio`, editors only): a lean dashboard for articles (editor, scheduling, cover images, bulk publish, unpublish and delete of up to 25 at a time), entities (companies, models and products with their parent company and descriptions), categories (both languages and their position), media, comment moderation, newsletter campaigns and subscribers, and social distribution. Content and operations are catalogue capabilities that the MCP endpoint and the site tools run too (a few Studio forms still call core services directly, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), so a change shows on the public pages at once.
- Site tools: the reader site registers five WebMCP tools (search, filter, open, read, save) and the Studio three (open the article editor, read the form, fill a draft) that an agent in ChatGPT's built-in browser uses on the live page; data and operations stay on MCP. See [SITE_TOOLS.md](docs/SITE_TOOLS.md).
- One portable plugin, `plugins/atlasnews`, for ChatGPT, Codex, Claude and Copilot CLI, with the marketplace files at the repository root. See [AGENT_PLUGIN.md](docs/AGENT_PLUGIN.md).
- Hexagonal boundaries: domain and application code do not depend on Next.js or Supabase.
- Server Components, immediate write invalidation, optimized images, self-hosted fonts, native view transitions/loading states, and an enforced token-driven design system.
- A local quality gate, `pnpm check`, that also builds the ChatGPT Sites artifact. The GitHub Actions workflow with the same checks is currently disabled, so the gate is that command run locally.

## Stack

- Next.js 16.3 and React 19.2 (plain `next build` for review, `vinext` for the ChatGPT Sites artifact)
- TypeScript 5
- ChatGPT Sites: Cloudflare D1 and R2 behind the same ports, Sign in with ChatGPT, one Worker
- Optional self-host: Supabase Postgres, Auth (also the OAuth 2.1 authorization server for the MCP), Storage, `pg_cron` and the SSR client
- MCP TypeScript SDK
- Vitest and ESLint
- `@google/design.md` CLI 0.4

## Run locally

Node.js 24 is used in CI and in the container image. The repository is a pnpm workspace and only pnpm installs it: `package.json` pins the version in `packageManager`, and npm refuses to install it. Enable Corepack once (`corepack enable pnpm`) or use any recent pnpm, which switches to the pinned version by itself. No environment variables are required for the read-only editorial demo or ephemeral demo Studio during local development.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. The root redirects permanently to `/en`; use `/it` for Italian. Demo editorial data lives in memory and resets when the process restarts. Comments, newsletter delivery and social publishing remain visibly unavailable until a persistent backend (the Sites bindings, or Supabase) and their real providers are configured. To run the Sites artifact itself with local D1 and R2, see "Local development with Sites behaviour" in [SITES.md](docs/SITES.md).

The reader site and Studio are `apps/web`. On ChatGPT Sites the MCP server and the workers run inside its Worker. Self-hosted, they are separate processes that run under plain Node and read their configuration from the process environment (for local work too):

```bash
pnpm --filter @atlasnews/mcp start    # http://localhost:8787  (PORT overrides)
pnpm --filter @atlasnews/jobs start   # http://localhost:8788  (PORT overrides)
```

To make local settings explicit:

```bash
cp .env.example apps/web/.env.local
```

`apps/mcp` and `apps/jobs` do not load `.env` files; export the same variables in their shell. The reader site links to the MCP server at `NEXT_PUBLIC_MCP_URL` (the site's own origin when unset on Sites, `http://localhost:8787` in local development).

Use `ATLASNEWS_CONTENT_MODE=demo` locally. On ChatGPT Sites the build defaults it to `sites` and the `DB` binding selects it; `ATLASNEWS_CONTENT_MODE=supabase` is for the self-host deployment. Local development also enables the ephemeral demo Studio. A production Studio fails closed without a persistent backend unless `ATLASNEWS_ENABLE_DEMO_STUDIO=true` is set explicitly for an intentional, disposable review deployment. Demo production never confirms a non-persistent newsletter write.

## Quality gate

```bash
pnpm check
```

The gate runs design-system validation, plugin validation, lint, TypeScript, tests, the plain production build, the Brotli bundle/image budgets and the ChatGPT Sites build. It is the only gate: run it locally before merging. The GitHub Actions workflow (`.github/workflows/ci.yml`) runs the same checks from a clean `pnpm install --frozen-lockfile`, but it is currently disabled on GitHub (re-enabling it is on the [go-live list](docs/GO_LIVE.md)). `pnpm plugin:release` additionally lists what the owner must supply before the plugin is submitted to a store.

## MCP quick check

Discovery metadata:

```bash
curl http://localhost:8787/info
```

Read the latest English articles (locally the server is `http://localhost:8787`; on a Site it is `https://<site>`, and the path is the same `/mcp`):

```bash
curl --request POST http://localhost:8787/mcp \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/call' \
  --header 'MCP-Name: list_articles' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_articles","arguments":{"locale":"en","limit":3},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

See [MCP.md](docs/MCP.md) for the tools, discovery, pagination, OAuth sign-in, legacy compatibility, CORS, and client configuration.

## Production setup

### ChatGPT Sites (default)

1. Install from the repository root (`pnpm install --frozen-lockfile`); `apps/web` cannot be built from a copy of its folder alone.
2. Ask `@Sites` to deploy the project in `apps/web`. It registers the Site, provisions D1 and R2, applies `apps/web/drizzle`, builds with `vinext`, packages and deploys. Commit the `project_id` it writes into `apps/web/.openai/hosting.json`.
3. Set the variables in the Site settings and redeploy: `ATLASNEWS_ADMIN_EMAILS`, `ATLASNEWS_COMMENT_GUEST_SECRET`, `ATLASNEWS_CLIENT_IP_HEADER=cf-connecting-ip`, `NEXT_PUBLIC_SITE_URL`, and the provider credentials you use (Resend, LinkedIn, X, WhatsApp).
4. Sign in at `/en/login` with an admin account, create the categories, publish a draft, and check `GET /api/health`, the Studio and `POST /mcp`.
5. Run the identity probe in [GO_LIVE.md](docs/GO_LIVE.md) before the audience is public.

Full instructions and what is not yet verified on a real Site: [SITES.md](docs/SITES.md), [GO_LIVE.md](docs/GO_LIVE.md).

### Self-host with Supabase (optional)

1. Reproduce the database locally with the committed Supabase configuration, migration, and seed.
2. Create separate Supabase projects for Preview/Staging and Production.
3. Dry-run and apply the migration; do not automatically seed production.
4. Bootstrap the first Auth editor through the Supabase Dashboard and a bounded SQL grant.
5. Configure Resend, LinkedIn, X and WhatsApp credentials/webhooks, plus the cron secret that `apps/jobs` checks.
6. Deploy the reader site (`apps/web`, with `ATLASNEWS_CONTENT_MODE=supabase`), run `apps/mcp` and `apps/jobs` as containers ([HOSTING.md](docs/HOSTING.md)), and store the worker schedule's Vault secrets so Supabase `pg_cron` can call `apps/jobs`.
7. Run the HTTP, localization, Supabase, comments, newsletter, social-outbox, MCP and MCP Events smoke checks.

Full instructions: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Go-live checklist: what the owner still has to do](docs/GO_LIVE.md)
- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Self-host deployment and environment setup (Supabase)](docs/DEPLOYMENT.md)
- [Reader site on ChatGPT Sites (the default deployment)](docs/SITES.md)
- [Data layer on ChatGPT Sites: D1, R2 and migrations](docs/SITES_DATA.md)
- [MCP server and workers as containers (self-host)](docs/HOSTING.md)
- [Site tools (WebMCP)](docs/SITE_TOOLS.md)
- [Internationalization and content model](docs/INTERNATIONALIZATION.md)
- [MCP server and client usage](docs/MCP.md)
- [OpenAI plugin extensions and MCP Events](docs/OPENAI_EXTENSIONS.md)
- [Portable agent plugin](docs/AGENT_PLUGIN.md)
- [Operations, performance budgets, troubleshooting, and rollback](docs/OPERATIONS.md)
- [Independent optimization report](docs/OPTIMIZATION_REPORT.md)
- [Design system source](DESIGN.md)

## Security model

- On Sites, D1 has no row-level security, so the delivery layer is the authorization boundary: the Studio receives its repositories only after an editor check, and `/mcp` maps the signed-in account to its editor row and scopes. Editors are matched by verified email, from the platform's headers or an own Google or GitHub session.
- Self-hosted, public pages and Studio use the public Supabase URL and anon/publishable key. Workers and the newsroom MCP tools use the service-role key only after the cron secret or an editor's OAuth sign-in has been checked; it must never use a `NEXT_PUBLIC_*` variable. Supabase RLS is the authorization boundary there. Proxy and UI checks are convenience layers, not authorization.
- Anonymous users can read only published content and approved comments. Comment/newsletter mutations pass constrained RPCs, signed guest capabilities, same-origin checks and database rate limits; direct table writes are denied.
- Only authenticated users mapped to an `editor` or `admin` profile can mutate editorial data.
- Anonymous MCP callers can only run read tools, which expose published content and approved comments. A newsroom tool needs a signed-in editor (on Sites the platform's sign-in; self-hosted a Bearer token, or the optional CI API key, which Sites ignores) before any server-only persistence or provider adapter is resolved; tools that publish, delete, email or post also ask for confirmation.

## Repository map

```text
packages/core/                        @atlasnews/core: domain, use cases and ports (no Next.js, React or Supabase)
  src/{editorial,comments,newsletter,social-publishing,mcp-events}/{domain,application}
  src/locale.ts                       locale contract (locales, Locale, isLocale, localizedPath)
packages/contract/                    @atlasnews/contract: the one capability catalogue (names, schemas, hints, scopes, handlers) read by the MCP server and the site tools
packages/adapters/                    @atlasnews/adapters: D1/R2 (Sites), Supabase, memory/seed, Resend, LinkedIn, X, WhatsApp, env, composition roots; one class per port, assembled in each container
apps/web/                             Next.js reader site, Studio, OAuth consent page, comments/articles/health API, provider webhooks, site tools; build/sites-worker.ts is the Sites Worker; drizzle/ holds the D1 migrations
  src/i18n/                           UI message catalogs (the locale contract is re-exported from core)
  src/server/                         web-only server code: comments, newsletter and WhatsApp HTTP, composition facade
apps/mcp/                             MCP server: POST /mcp, GET /info, OAuth resource metadata (a container self-hosted; mounted by the Sites Worker)
apps/jobs/                            workers: /internal/{social-outbox,newsletter-outbox,comment-notifications,mcp-events} (a container self-hosted; run by the Sites Worker in the background of requests)
supabase/  plugins/atlasnews/  docs/  scripts/  DESIGN.md   shared at the repository root
```

The canonical architecture description is [ARCHITECTURE.md](docs/ARCHITECTURE.md).
