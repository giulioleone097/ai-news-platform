# NEURA

An English-first, internationalized AI news platform built with Next.js, Supabase, and the Model Context Protocol (MCP). NEURA includes a zero-configuration editorial preview; every operational write, notification, campaign and social publication uses real persisted adapters and fails closed when its provider is not configured.

## What ships

- English-first routes with Italian content parity: `/en` and `/it`.
- Editorial home, infinite latest/category/search feeds, article pages, localized RSS, native social sharing, bookmarks and deferred comments.
- Persisted comment threads with signed guest identity, own-edit/delete windows, reports, moderation audit, rate limits and real email notifications.
- Double-opt-in newsletter, Markdown campaigns, recipient snapshots, scheduling, Resend delivery, signed webhooks, suppression, unsubscribe and erasure.
- Real LinkedIn, X and WhatsApp publishing through leased, idempotent Supabase outboxes with retry/read-back.
- Supabase Postgres and Storage with full-text search, row-level security, editorial roles, translations, consent registries and immutable media.
- Public, stateless, read-only MCP server at `/mcp` (standalone `apps/mcp`); approved comments are included without exposing private moderation data.
- ChatGPT and Claude app surface on the public MCP: an MCP Apps newsroom UI, ChatGPT sidebar and side-panel entrypoints, deep links, composer @-mentions, a native-form briefing, article resources and MCP Events webhooks for newly published articles. See [OPENAI_EXTENSIONS.md](docs/OPENAI_EXTENSIONS.md).
- API-key-protected admin MCP at `/mcp/admin` with editorial CRUD, comment moderation, campaigns, media and social outbox tools.
- Portable agent plugin manifests for Codex/OpenAI, Claude Code, and GitHub Copilot CLI.
- Hexagonal boundaries: domain and application code do not depend on Next.js or Supabase.
- Server Components, immediate write invalidation, optimized images, self-hosted fonts, native view transitions/loading states, and an enforced token-driven design system.
- Vercel configuration and GitHub Actions quality gate.

## Stack

- Next.js 16.3 and React 19.2
- TypeScript 5
- Supabase Postgres, Auth, and SSR client
- MCP TypeScript SDK
- Vitest and ESLint
- `@google/design.md` CLI 0.4

## Run locally

Node.js 24 is used in CI and on Vercel. No environment variables are required for the read-only editorial demo or ephemeral demo Studio during local development.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The root redirects permanently to `/en`; use `/it` for Italian. Demo editorial data lives in memory and resets when the process restarts. Comments, newsletter delivery and social publishing remain visibly unavailable until Supabase and their real providers are configured.

The reader site and Studio are `apps/web`. The MCP server and the background workers are separate processes that run under plain Node and read their configuration from the process environment:

```bash
npm run start -w apps/mcp    # http://localhost:8787  (PORT overrides)
npm run start -w apps/jobs   # http://localhost:8788  (PORT overrides)
```

To make local settings explicit:

```bash
cp .env.example apps/web/.env.local
```

`apps/mcp` and `apps/jobs` do not load `.env` files; export the same variables in their shell. The reader site links to the MCP server at `NEXT_PUBLIC_MCP_URL` (default `http://localhost:8787`).

Use `NEURA_CONTENT_MODE=demo` locally and `NEURA_CONTENT_MODE=supabase` in every Preview/Production environment. Local development also enables the ephemeral demo Studio. Production Studio fails closed without Supabase unless `NEURA_ENABLE_DEMO_STUDIO=true` is set explicitly for an intentional, disposable review deployment. Demo production never confirms a non-persistent newsletter write.

## Quality gate

```bash
npm run check
```

The gate runs design-system validation, plugin validation, lint, TypeScript, tests, the production build, and Brotli bundle/image budgets. GitHub Actions runs the same checks from a clean `npm ci` install.

## MCP quick check

Discovery metadata:

```bash
curl http://localhost:8787/info
```

Read the latest English articles:

```bash
curl --request POST http://localhost:8787/mcp \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json, text/event-stream' \
  --header 'MCP-Protocol-Version: 2026-07-28' \
  --header 'MCP-Method: tools/call' \
  --header 'MCP-Name: list_articles' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_articles","arguments":{"locale":"en","limit":3},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
```

See [MCP.md](docs/MCP.md) for public and admin tools, modern discovery, pagination, authentication, legacy compatibility, CORS, and production client configuration.

## Production setup

1. Reproduce the database locally with the committed Supabase configuration, migration, and seed.
2. Create separate Supabase projects for Preview/Staging and Production.
3. Dry-run and apply the migration; do not automatically seed production.
4. Bootstrap the first Auth editor through the Supabase Dashboard and a bounded SQL grant.
5. Configure Resend, LinkedIn, X and WhatsApp credentials/webhooks, plus the cron secret that `apps/jobs` checks.
6. Deploy `apps/web` (Vercel root directory `apps/web`) and run `apps/mcp` and `apps/jobs` where a Node process or fetch handler can be hosted, with the documented environment variables.
7. Run the HTTP, localization, Supabase, comments, newsletter, social-outbox, MCP and MCP Events smoke checks.

Full instructions: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Deployment and environment setup](docs/DEPLOYMENT.md)
- [Internationalization and content model](docs/INTERNATIONALIZATION.md)
- [MCP server and client usage](docs/MCP.md)
- [OpenAI plugin extensions and MCP Events](docs/OPENAI_EXTENSIONS.md)
- [Cross-client agent plugin](docs/AGENT_PLUGIN.md)
- [Operations, performance budgets, troubleshooting, and rollback](docs/OPERATIONS.md)
- [Independent optimization report](docs/OPTIMIZATION_REPORT.md)
- [Design system source](DESIGN.md)

## Security model

- Public pages and Studio use the public Supabase URL and anon/publishable key. Workers and the admin MCP use the service-role key only after cron/API-key authentication; it must never use a `NEXT_PUBLIC_*` variable.
- Supabase RLS is the authorization boundary. Proxy and UI checks are convenience layers, not authorization.
- Anonymous users can read only published content and approved comments. Comment/newsletter mutations pass constrained RPCs, signed guest capabilities, same-origin checks and database rate limits; direct table writes are denied.
- Only authenticated users mapped to an `editor` or `admin` profile can mutate editorial data.
- The public MCP surface is intentionally read-only and exposes only published content plus approved comments. The admin endpoint requires a high-entropy Bearer key before resolving any server-only persistence/provider adapter; external actions additionally require `confirm: true`.

## Repository map

```text
packages/core/                        @atlasnews/core: domain, use cases and ports (no Next.js, React or Supabase)
  src/{editorial,comments,newsletter,social-publishing,mcp-events}/{domain,application}
  src/locale.ts                       locale contract (locales, Locale, isLocale, localizedPath)
packages/contract/                    @atlasnews/contract: public contract package (placeholder)
packages/adapters/                    @atlasnews/adapters: Supabase, memory/seed, Resend, LinkedIn, X, WhatsApp, env, composition roots
apps/web/                             Next.js reader site, Studio, comments/articles/health API, provider webhooks
  src/i18n/                           UI message catalogs (the locale contract is re-exported from core)
  src/server/                         web-only server code: comments, newsletter and WhatsApp HTTP, composition facade
apps/mcp/                             standalone MCP server: POST /mcp, POST /mcp/admin, GET /info
apps/jobs/                            standalone workers: /internal/{social-outbox,newsletter-outbox,comment-notifications,mcp-events}
supabase/  plugins/  docs/  scripts/  DESIGN.md   shared at the repository root
```

The canonical architecture description is [ARCHITECTURE.md](docs/ARCHITECTURE.md).
