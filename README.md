# NEURA

An English-first, internationalized AI news platform built with Next.js, Supabase, and the Model Context Protocol (MCP). NEURA includes a zero-configuration editorial preview; every operational write, notification, campaign and social publication uses real persisted adapters and fails closed when its provider is not configured.

## What ships

- English-first routes with Italian content parity: `/en` and `/it`.
- Editorial home, infinite latest/category/search feeds, article pages, localized RSS, native social sharing, bookmarks and deferred comments.
- Persisted comment threads with signed guest identity, own-edit/delete windows, reports, moderation audit, rate limits and real email notifications.
- Double-opt-in newsletter, Markdown campaigns, recipient snapshots, scheduling, Resend delivery, signed webhooks, suppression, unsubscribe and erasure.
- Real LinkedIn, X and WhatsApp publishing through leased, idempotent Supabase outboxes with retry/read-back.
- Supabase Postgres and Storage with full-text search, row-level security, editorial roles, translations, consent registries and immutable media.
- Public, stateless, read-only MCP server at `/api/mcp`; approved comments are included without exposing private moderation data.
- API-key-protected admin MCP at `/api/mcp/admin` with editorial CRUD, comment moderation, campaigns, media and social outbox tools.
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

To make local settings explicit:

```bash
cp .env.example .env.local
```

Use `NEURA_CONTENT_MODE=demo` locally and `NEURA_CONTENT_MODE=supabase` in every Preview/Production environment. Local development also enables the ephemeral demo Studio. Production Studio fails closed without Supabase unless `NEURA_ENABLE_DEMO_STUDIO=true` is set explicitly for an intentional, disposable review deployment. Demo production never confirms a non-persistent newsletter write.

## Quality gate

```bash
npm run check
```

The gate runs design-system validation, plugin validation, lint, TypeScript, tests, the production build, and Brotli bundle/image budgets. GitHub Actions runs the same checks from a clean `npm ci` install.

## MCP quick check

Discovery metadata:

```bash
curl http://localhost:3000/api/mcp/info
```

Read the latest English articles:

```bash
curl --request POST http://localhost:3000/api/mcp \
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
5. Configure Resend, LinkedIn, X and WhatsApp credentials/webhooks, plus the Vercel cron secret.
6. Import this repository into Vercel, set the documented environment variables, and deploy.
7. Run the HTTP, localization, Supabase, comments, newsletter, social-outbox and MCP smoke checks.

Full instructions: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Deployment and environment setup](docs/DEPLOYMENT.md)
- [Internationalization and content model](docs/INTERNATIONALIZATION.md)
- [MCP server and client usage](docs/MCP.md)
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
src/app/                              Next.js delivery adapter
src/components/                       UI components
src/i18n/                             locale contract and message catalogs
src/modules/editorial/domain/         entities, invariants, and ports
src/modules/editorial/application/    use cases and cached queries
src/modules/editorial/infrastructure/ memory and Supabase adapters
src/modules/comments/                 threaded comments, moderation and notifications
src/modules/newsletter-delivery/      campaigns, Resend and consent lifecycle
src/modules/social-publishing/        provider adapters and social outbox
src/modules/mcp/                       public and authenticated MCP adapters
plugins/neura-ai-news/                 portable agent plugin bundle
supabase/migrations/                  versioned database schema and RLS
supabase/seed.sql                     deterministic development content
```

The canonical architecture description is [ARCHITECTURE.md](docs/ARCHITECTURE.md).
