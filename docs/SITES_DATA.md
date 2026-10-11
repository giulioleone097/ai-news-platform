# Data on ChatGPT Sites (D1 and R2)

`ATLASNEWS_CONTENT_MODE=sites` keeps every record in the Site's own D1 database and every uploaded file in its R2 bucket, so a deployment on ChatGPT Sites needs no Supabase. The Supabase adapters stay for a self-hosted deployment (`ATLASNEWS_CONTENT_MODE=supabase`, see [DEPLOYMENT.md](DEPLOYMENT.md)); both implement the same core ports, so the use cases, the capability catalogue and the delivery code do not change with the backend.

## Bindings

`apps/web/.openai/hosting.json` declares `"d1": "DB"` and `"r2": "BUCKET"`. Sites provisions both and injects them into the Worker; `apps/web/build/sites-worker.ts` hands the Worker's `env` to `setSitesBindings` (`packages/adapters/src/sites/bindings.ts`) before each request. With no explicit `ATLASNEWS_CONTENT_MODE`, a present `DB` binding selects `sites`.

`packages/adapters/src/sites/cloudflare.ts` declares the subset of the D1 and R2 APIs the adapters use, so the packages do not depend on `@cloudflare/workers-types`.

## Schema and migrations

The schema lives in `apps/web/drizzle/` in the layout the Sites tooling expects: one SQL file per migration, listed in `meta/_journal.json`, statements separated by `--> statement-breakpoint`. The build copies the folder to `dist/.openai/drizzle`, and Sites applies pending migrations before it uploads the Worker. Applied migrations are immutable: change the schema by appending a new file and a journal entry. Migrations are schema-only: no seed data, no backfills.

| Migration | Owner (adapter) |
| --- | --- |
| `0000_content` | `editorial/d1-editorial-repository.ts`: authors, categories, articles, entities, story links, distribution, newsletter subscribers |
| `0001_editors` | `sites/editors.ts`: who may use the Studio and the newsroom tools |
| `0002_comments` | `comments/d1-*.ts` |
| `0003_newsletter` | `newsletter/d1-*.ts` |
| `0004_social_outbox` | `social-publishing/d1-*.ts` |
| `0005_mcp_events` | `mcp-events/d1-*.ts` |
| `0006_jobs` | `sites/jobs.ts`: the lease that keeps one job run at a time |

## Conventions

- **Types.** IDs are `TEXT` UUIDs from `crypto.randomUUID()`. Timestamps are `TEXT` ISO-8601 UTC with milliseconds (`new Date().toISOString()`), which sort as text. Booleans are `INTEGER` 0/1. Arrays and objects are JSON in `TEXT`. Enumerations get a `CHECK` that mirrors the Postgres one.
- **Integrity.** D1 enforces foreign keys. Keep the `ON DELETE` behaviour, uniqueness and checks of the Postgres schema; the database, not only the code, must reject an invalid row.
- **Atomic writes.** D1 has no interactive transactions. A multi-statement write is one `database.batch([...])`, which applies all of its statements or none. Validate first (the core's `validateEach` already does), then build every statement, then run the batch. Guard read-modify-write races in SQL: conditional `UPDATE ... WHERE`, `INSERT ... SELECT ... WHERE NOT EXISTS`, `RETURNING`.
- **Leases.** Outbox claims replace Postgres `FOR UPDATE SKIP LOCKED` with one `UPDATE ... SET lease_token = ?, leased_until = ? WHERE id IN (SELECT id ... LIMIT ?) RETURNING *`. SQLite runs one write at a time, so two claims never take the same row.
- **Authorization.** Supabase enforced part of it with RLS. The D1 adapters run with full access, so authorization stays in the delivery layer (Studio actions, the MCP scopes, the moderator check) exactly as for the service-role Supabase client. A repository built for the `public` audience returns published records only.
- **Search.** Full-text search uses an FTS5 table kept in sync by the adapter.
- **Media.** Files go to R2 under `editorial-media/<path>` and are served by the site at `/media-store/<path>`.

## Tests

`packages/adapters/src/sites/testing.ts` starts Miniflare (the runtime Sites uses), creates a D1 database and an R2 bucket, and applies the migrations in journal order. Adapter tests run against that real D1, not a mock.
