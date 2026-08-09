# Deployment

This runbook prepares NEURA for Vercel and Supabase without creating or mutating a remote project automatically.

## Deployment modes

| Mode | Persistence | Intended use |
| --- | --- | --- |
| Demo | Process-local memory | Zero-config development; public CI and visual review |
| Local Supabase | Docker-backed Supabase CLI stack | Migration, RLS, Auth, and integration verification |
| Preview | Dedicated non-production Supabase project | Vercel branch/PR validation |
| Production | Dedicated production Supabase project | Live editorial platform |

Never point a Preview deployment at the production database.

## Environment matrix

| Variable | Demo/CI | Local Supabase | Preview | Production | Exposure |
| --- | --- | --- | --- | --- | --- |
| `NEURA_CONTENT_MODE` | `demo` | `supabase` | `supabase` | `supabase` | Server/build composition |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `http://localhost:3000` | Exact protected preview origin or canonical production origin | Canonical HTTPS origin | Public, build-time |
| `NEXT_PUBLIC_SUPABASE_URL` | Empty | CLI API URL | Preview project URL | Production project URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Empty | CLI anon key | Preview anon/publishable key | Production anon/publishable key | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Empty | Local service-role key when testing admin MCP | Preview project service-role key | Production project service-role key | Server-only, admin MCP only |
| `NEURA_MCP_ADMIN_AUTHOR_ID` | Empty | Existing `public.authors` UUID | Existing preview author UUID | Existing production author UUID | Server-only, admin MCP only |
| `NEURA_MCP_ADMIN_API_KEY` | Empty | High-entropy local key | Unique preview key | Unique production key | Server-only |
| `NEURA_ENABLE_DEMO_STUDIO` | Empty | Empty | Empty unless the preview is intentionally ephemeral | Empty | Server-only |
| `NEXT_PUBLIC_LINKEDIN_URL` | Empty | Empty or official profile | Preview-safe official profile | Official LinkedIn profile URL | Public, build-time |
| `NEXT_PUBLIC_X_URL` | Empty | Empty or official profile | Preview-safe official profile | Official X profile URL | Public, build-time |
| `MCP_ALLOWED_ORIGINS` | `http://localhost:3000` or empty | Local caller origins | Approved preview callers | Comma-separated production callers; empty for public wildcard | Server-only |

`NEURA_CONTENT_MODE` selects the adapter explicitly. Supabase mode requires both the public URL and anon key and fails visibly if either is missing. The service-role key is optional and used only by the authenticated admin MCP route; never expose it through `NEXT_PUBLIC_*`. Configure all three admin values together or the admin route fails closed.

The committed Next.js configuration rejects a Vercel build unless content mode is `supabase`, both public Supabase values exist, and `NEXT_PUBLIC_SITE_URL` is a non-local HTTPS origin. This prevents a green deployment that silently serves demo data or localhost metadata.

In explicit demo mode, public routes serve the read-only memory dataset. Studio is available automatically in local development, but fails closed in a production build. Set `NEURA_ENABLE_DEMO_STUDIO=true` only for an intentional disposable review deployment; never use it as a Production substitute for Supabase Auth, Storage and RLS.

`NEXT_PUBLIC_*` values are frozen into client bundles during `next build`. Changing one requires a new deployment.

## Local demo

```bash
npm ci
npm run dev
```

No database, Docker daemon, or provider account is required. State resets when the process restarts.

## Reproduce Supabase locally

Prerequisites: Docker-compatible runtime and the Supabase CLI (the commands below use `npx`). The committed `supabase/config.toml` defines the local stack.

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:status
```

`db reset --local` destroys only the local database, replays every committed migration, and then applies `supabase/seed.sql`. Copy the API URL and anon key printed by `supabase status` into `.env.local`, then restart Next.js.

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEURA_CONTENT_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
MCP_ALLOWED_ORIGINS=http://localhost:3000
# Optional authenticated admin MCP configuration:
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
NEURA_MCP_ADMIN_AUTHOR_ID=<existing-local-user-uuid>
NEURA_MCP_ADMIN_API_KEY=<openssl-rand-hex-32-output>
```

Stop the local stack without deleting data:

```bash
npx --no-install supabase stop
```

## Prepare remote Supabase

Create Preview and Production projects manually in the Supabase Dashboard. For the current Vercel `fra1` function region, select the closest available European database region. If the database is elsewhere, change the Vercel function region to minimize application-to-database latency.

Authenticate and link one environment at a time:

```bash
npx --no-install supabase login
npx --no-install supabase link --project-ref <project-ref>
npx --no-install supabase migration list
npx --no-install supabase db push --dry-run
```

Before production migration:

- confirm the linked project reference in the command output;
- take or verify a recoverable database backup;
- review the dry-run and the SQL migration;
- confirm no production data exists only in Preview;
- run the repository quality gate.

Apply only after those checks:

```bash
npx --no-install supabase db push
```

Do not use `db reset --linked` on Production. Do not use `--include-seed` automatically on Production. The committed seed is deterministic demo/editorial content; if launch content is desired, review it as production data and apply it once through an explicit, audited operation. The studio needs at least one category for each authored locale, so an empty Production project must either receive reviewed localized categories or the approved category portion of the seed before the first article is created.

In Supabase **Authentication → URL Configuration**, set the production Site URL to the canonical HTTPS origin and allow these exact redirects:

```text
https://<canonical-host>/en/auth/callback
https://<canonical-host>/it/auth/callback
```

Add exact protected Preview callback origins only to the Preview Supabase project. Avoid a broad production wildcard. Keep email/password Auth enabled for the studio and public sign-up disabled.

## Bootstrap the first editor

1. In Supabase Dashboard, create or invite the user under **Authentication → Users**. Prefer invite/verified-email flows; do not insert a password into SQL.
2. Copy the Auth user UUID.
3. Ensure an author record exists.
4. In the Production SQL Editor, run a bounded transaction with the real values:

```sql
begin;

insert into public.authors (id, name, role, initials)
values ('<AUTHOR_UUID>'::uuid, '<DISPLAY_NAME>', 'Editor', '<INITIALS>')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  initials = excluded.initials;

insert into public.profiles (id, author_id, role)
values ('<AUTH_USER_UUID>'::uuid, '<AUTHOR_UUID>'::uuid, 'admin')
on conflict (id) do update set
  author_id = excluded.author_id,
  role = excluded.role;

commit;
```

5. Verify exactly one row and the intended identity:

```sql
select u.email, p.role, a.name
from auth.users as u
join public.profiles as p on p.id = u.id
join public.authors as a on a.id = p.author_id
where u.id = '<AUTH_USER_UUID>'::uuid;
```

Use `editor` for routine staff and reserve `admin` by operating convention. Both roles currently satisfy the same RLS editor predicate; a future permission split requires a migration and authorization tests. Remove access by deleting the `public.profiles` row; do not share Auth accounts. Public sign-up is disabled in the committed local Auth configuration and should remain disabled for an invite-only production studio.

## Configure Vercel

Import the GitHub repository and use these project settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `.` |
| Install Command | `npm ci` (also committed in `vercel.json`) |
| Build Command | `npm run build` (also committed in `vercel.json`) |
| Node.js | 24.x |
| Function region | `fra1`, unless the selected Supabase region requires a closer Vercel region |

Add environment variables separately for Preview and Production. Keep Preview deployments protected, especially when they expose unpublished studio content. Attach the canonical domain, update `NEXT_PUBLIC_SITE_URL` to its HTTPS origin, and redeploy so metadata and share URLs use it.

The MCP functions have a 10-second maximum duration. Their normal calls should remain far below that budget.

`GET /api/health` is the deployment-readiness boundary. In production it returns `200` only when content mode is Supabase and the canonical origin is non-local HTTPS; it reports bounded check names and never credentials.

## Release order

1. `npm ci && npm run check` at the release commit.
2. Supabase backup/readiness check.
3. `supabase db push --dry-run`, then `supabase db push`.
4. Vercel deployment with environment-specific variables.
5. Post-deploy smoke checks below.
6. Publish editorial content only after the platform checks pass.

## Post-deploy smoke checks

Replace `$SITE` with the canonical origin.

```bash
curl --fail --silent --show-error --location "$SITE/en" >/dev/null
curl --fail --silent --show-error --location "$SITE/it" >/dev/null
curl --fail --silent --show-error "$SITE/api/health" | grep '"status":"ready"'
curl --fail --silent --show-error "$SITE/en/feed.xml" | grep '<language>en</language>'
curl --fail --silent --show-error "$SITE/it/feed.xml" | grep '<language>it</language>'
curl --fail --silent --show-error "$SITE/api/mcp/info" | grep 'neura-ai-news'
```

Then verify in a browser:

- `/` redirects to `/en`;
- English and Italian navigation switch without losing the current content context;
- home, category, search, and article pages render real Supabase content;
- editor sign-in rejects an unprofiled Auth user and accepts the bootstrapped editor;
- a draft is not visible anonymously;
- a newly published article becomes visible after cache revalidation;
- newsletter submission creates one normalized subscription and duplicate submission is idempotent;
- social links encode the canonical article URL;
- localized RSS contains only published rows for its requested language;
- MCP `server/discover` and `list_articles` return published content only; a legacy initialize probe remains compatible.
- admin MCP rejects missing and incorrect Bearer keys; with the correct key, list tools and exercise create/update/publish/delete on a disposable draft.

See [OPERATIONS.md](OPERATIONS.md) for rollback and incident procedures.
