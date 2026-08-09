# NEURA

An English-first, internationalized AI news platform built with Next.js, Supabase, and the Model Context Protocol (MCP). NEURA ships with a zero-configuration in-memory demo, so the complete public experience can run before any external service is configured.

## What ships

- English-first routes with Italian content parity: `/en` and `/it`.
- Editorial home, infinite latest/category/search feeds, article pages, localized RSS, newsletter capture, and social share intents.
- Supabase Postgres schema with full-text search, row-level security, editorial roles, publication state, translations, newsletter subscriptions, and social distribution state.
- Public, stateless, read-only MCP server over Streamable HTTP at `/api/mcp`.
- Hexagonal boundaries: domain and application code do not depend on Next.js or Supabase.
- Server Components, route-level caching, optimized images, self-hosted fonts, and a token-driven design system.
- Vercel configuration and GitHub Actions quality gate.

## Stack

- Next.js 16.3 and React 19.2
- TypeScript 5
- Supabase Postgres, Auth, and SSR client
- MCP TypeScript SDK
- Vitest and ESLint
- `@google/design.md` CLI 0.4

## Run locally

Node.js 24 is used in CI and on Vercel. No environment variables are required for the public demo or for demo Studio during local development.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The root redirects permanently to `/en`; use `/it` for Italian. Demo data lives in memory and resets when the process restarts.

To make local settings explicit:

```bash
cp .env.example .env.local
```

Leave both Supabase variables empty for the public memory fallback. Local development also enables the ephemeral demo Studio. Production Studio fails closed without Supabase unless `NEURA_ENABLE_DEMO_STUDIO=true` is set explicitly for an intentional, disposable review deployment.

## Quality gate

```bash
npm run check
```

The gate runs design-system validation, lint, TypeScript, tests, and the production build. GitHub Actions runs the same checks from a clean `npm ci` install.

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

See [MCP.md](docs/MCP.md) for modern discovery, tools, pagination, legacy compatibility, CORS, and production client configuration.

## Production setup

1. Reproduce the database locally with the committed Supabase configuration, migration, and seed.
2. Create separate Supabase projects for Preview/Staging and Production.
3. Dry-run and apply the migration; do not automatically seed production.
4. Bootstrap the first Auth editor through the Supabase Dashboard and a bounded SQL grant.
5. Import this repository into Vercel, set the documented environment variables, and deploy.
6. Run the HTTP, localization, Supabase, newsletter, and MCP smoke checks.

Full instructions: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Deployment and environment setup](docs/DEPLOYMENT.md)
- [Internationalization and content model](docs/INTERNATIONALIZATION.md)
- [MCP server and client usage](docs/MCP.md)
- [Operations, performance budgets, troubleshooting, and rollback](docs/OPERATIONS.md)
- [Independent optimization report](docs/OPTIMIZATION_REPORT.md)
- [Design system source](DESIGN.md)

## Security model

- The application uses only the public Supabase URL and anon/publishable key. Never add a service-role key to this project or to a `NEXT_PUBLIC_*` variable.
- Supabase RLS is the authorization boundary. Proxy and UI checks are convenience layers, not authorization.
- Anonymous users can read only published content and call the constrained, idempotent newsletter subscription RPC; direct table inserts are denied.
- Only authenticated users mapped to an `editor` or `admin` profile can mutate editorial data.
- The MCP surface is intentionally read-only and exposes only published content.

## Repository map

```text
src/app/                              Next.js delivery adapter
src/components/                       UI components
src/i18n/                             locale contract and message catalogs
src/modules/editorial/domain/         entities, invariants, and ports
src/modules/editorial/application/    use cases and cached queries
src/modules/editorial/infrastructure/ memory and Supabase adapters
src/modules/mcp/                       public MCP delivery adapter
supabase/migrations/                  versioned database schema and RLS
supabase/seed.sql                     deterministic development content
```

The canonical architecture description is [ARCHITECTURE.md](docs/ARCHITECTURE.md).
