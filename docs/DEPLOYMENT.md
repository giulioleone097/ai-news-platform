# Deployment

This runbook is the self-hosted deployment on Supabase (`ATLASNEWS_CONTENT_MODE=supabase`), the alternative to the default ChatGPT Sites deployment, which needs none of it ([SITES.md](SITES.md)). It prepares the hosts without creating or mutating a remote project automatically: the reader site (`next start`, or the Sites Worker with the Supabase mode), the MCP server and the workers as containers ([HOSTING.md](HOSTING.md)), and Supabase.

## Deployment modes

| Mode | Persistence | Intended use |
| --- | --- | --- |
| Demo | Process-local memory | Zero-config development; public CI and visual review |
| Sites | The Site's D1 and R2 | The default production deployment ([SITES.md](SITES.md)) |
| Local Supabase | Docker-backed Supabase CLI stack | Migration, RLS, Auth, and integration verification |
| Preview | Dedicated non-production Supabase project | A separate Site and separate containers for staging review |
| Production | Dedicated production Supabase project | Live editorial platform |

Never point a Preview deployment at the production database.

## Environment matrix

| Variable | Demo/CI | Local Supabase | Preview | Production | Exposure |
| --- | --- | --- | --- | --- | --- |
| `ATLASNEWS_CONTENT_MODE` | `demo` | `supabase` | `supabase` | `supabase` | Server/build composition |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `http://localhost:3000` | Exact protected preview origin or canonical production origin | Canonical HTTPS origin | Public, build-time |
| `NEXT_PUBLIC_SUPABASE_URL` | Empty | CLI API URL | Preview project URL | Production project URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Empty | CLI anon key | Preview anon/publishable key | Production anon/publishable key | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Empty | Local service-role key for operational testing | Preview project service-role key | Production project service-role key | Server-only: comments, workers and the newsroom MCP tools |
| `ATLASNEWS_MCP_ADMIN_AUTHOR_ID` | Empty | Existing `public.authors` UUID | Existing preview author UUID | Existing production author UUID | Server-only, `apps/mcp`; author of API-key writes only |
| `ATLASNEWS_MCP_ADMIN_API_KEY` | Empty | High-entropy local key | Unique preview key | Unique production key, or empty | Server-only, `apps/mcp`; optional CI and CLI credential. Editors sign in with OAuth instead |
| `ATLASNEWS_MCP_OAUTH_ISSUER` / `ATLASNEWS_MCP_OAUTH_AUDIENCE` | Empty | Empty | Empty unless needed | Only for a Supabase custom domain or a custom access-token audience | Server-only, `apps/mcp`; see [MCP.md](MCP.md#sign-in-with-supabase-auth) |
| `ATLASNEWS_REVALIDATE_SECRET` | Empty | Independent random value | Independent preview value | Independent production value | Server-only; the same value on `apps/web` and `apps/mcp` |
| `CRON_SECRET` | Empty | Disposable local key | Unique preview key | Unique production key | Server-only (`apps/jobs`); the same value is stored in the project's Vault as `jobs_cron_secret` |
| `ATLASNEWS_COMMENT_GUEST_SECRET` | Empty | Independent random value | Independent preview value | Independent production value | Server-only, signed guest/comment capabilities |
| `RESEND_API_KEY` | Empty | Resend test key | Preview provider key | Production provider key | Server-only |
| `RESEND_WEBHOOK_SECRET` | Empty | Signed test webhook secret | Preview endpoint secret | Production endpoint secret | Server-only |
| `NEWSLETTER_FROM_EMAIL` | Empty | Verified test sender | Verified preview sender | Verified production sender | Server-only |
| `NEWSLETTER_REPLY_TO` | Empty | Optional valid email | Optional valid email | Optional valid email | Server-only |
| `NEWSLETTER_UNSUBSCRIBE_SECRET` | Empty | Independent random value | Independent preview value | Independent production value | Server-only |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_AUTHOR_URN` / `LINKEDIN_API_VERSION` | Empty | Optional real sandbox/account values | Preview account values | Production account values | Server-only |
| `X_USER_ACCESS_TOKEN` | Empty | Optional write-scoped token | Preview write-scoped token | Production write-scoped token | Server-only |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_API_VERSION` | Empty | Optional test-number values | Preview values | Production values | Server-only |
| `WHATSAPP_WEBHOOK_SECRET` / `WHATSAPP_VERIFY_TOKEN` | Empty | Independent test values | Preview values | Production values | Server-only |
| `ATLASNEWS_ENABLE_DEMO_STUDIO` | Empty | Empty | Empty unless the preview is intentionally ephemeral | Empty | Server-only |
| `ATLASNEWS_CLIENT_IP_HEADER` | Empty | Empty | Name of the edge's client-address header | Name of the edge's client-address header | Server-only, `apps/web`; [below](#client-address-and-rate-limits) |
| `ATLASNEWS_SUPABASE_OAUTH_PROVIDERS` | Empty | Empty or `google,github` | `google,github`, only those enabled in the Preview project | `google,github`, only those enabled in the Production project | Server-only, `apps/web`; lists the providers the login page and the comment section offer ([below](#sign-in-with-google-and-github)) |
| `ATLASNEWS_MCP_OAUTH_CLIENT_IDS` | Empty | Empty | Pre-registered client ids (required for editor sign-in) | Pre-registered client ids (required for editor sign-in) | Server-only, `apps/mcp` and `apps/web` (health); [MCP.md](MCP.md#sign-in-with-supabase-auth) |
| `ATLASNEWS_OAUTH_REDIRECT_HOSTS` | Empty (default hosts) | Empty | Empty unless a client needs another host | Empty unless a client needs another host | Server-only, `apps/web`; [MCP.md](MCP.md#sign-in-with-supabase-auth) |
| `ATLASNEWS_MCP_EVENTS_MAX_PER_PRINCIPAL` / `_MAX_PER_HOST` / `_MAX_PER_DOMAIN` / `_MAX_SUBSCRIPTIONS` / `_SUBSCRIBES_PER_MINUTE` | Empty (20 / 25 / 100 / 1000 / 30) | Empty | Empty | Tune from observed ChatGPT callback hosts | Server-only, `apps/mcp`; [OPENAI_EXTENSIONS.md](OPENAI_EXTENSIONS.md#abuse-limits) |
| `NEXT_PUBLIC_LINKEDIN_URL` | Empty | Empty or official profile | Preview-safe official profile | Official LinkedIn profile URL | Public, build-time |
| `NEXT_PUBLIC_X_URL` | Empty | Empty or official profile | Preview-safe official profile | Official X profile URL | Public, build-time |
| `NEXT_PUBLIC_MCP_URL` | Empty (defaults to `http://localhost:8787`) | Local `apps/mcp` origin | Preview `apps/mcp` origin | Production `apps/mcp` origin | Public, build-time |
| `MCP_ALLOWED_ORIGINS` | Empty, or `http://localhost:3000` to call from a local page | Local caller origins | Approved preview callers | Comma-separated production callers; empty allows the site's own origin, `https://chatgpt.com` and `https://claude.ai` | Server-only |

`ATLASNEWS_CONTENT_MODE` selects the adapter explicitly. Supabase mode requires both the public URL and anon key and fails visibly if either is missing. The service-role key is mandatory for production workers, comment mutations and the signed-in newsroom MCP tools; never expose it through `NEXT_PUBLIC_*`. Production readiness reports every incomplete operational capability instead of silently simulating it.

The committed Next.js configuration rejects a production build aimed at a public origin or a hosted Supabase project unless content mode is `supabase`, both public Supabase values exist, and `NEXT_PUBLIC_SITE_URL` is a non-local HTTPS origin ([SITES.md](SITES.md#build-guard)). This prevents a green deployment that silently serves demo data or localhost metadata.

In explicit demo mode, public routes serve the read-only memory dataset. Studio is available automatically in local development, but fails closed in a production build. Set `ATLASNEWS_ENABLE_DEMO_STUDIO=true` only for an intentional disposable review deployment; never use it as a Production substitute for Supabase Auth, Storage and RLS.

`NEXT_PUBLIC_*` values are frozen into client bundles during `next build`. Changing one requires a new deployment.

### Client address and rate limits

Two limits are keyed by the caller's network: new comments, edits, deletions and reports, and newsletter subscription requests. (`events/subscribe` on the MCP server is keyed by the signed-in account instead.) A client controls every request header unless a proxy in front of the app overwrites it, so the address is read from exactly one header, named by `ATLASNEWS_CLIENT_IP_HEADER`, with no fallback and no default. The value must be an IP address; for a comma list such as `x-forwarded-for` the last entry (the one your proxy appended) is used. IPv6 addresses count per /64.

| Deployment | Set `ATLASNEWS_CLIENT_IP_HEADER` to |
| --- | --- |
| ChatGPT Sites (Cloudflare-style Worker) | `cf-connecting-ip`. Cloudflare sets it on every request that reaches the Worker, so a client cannot choose it. Not verified on a real Sites deployment: check it, see [SITES.md](SITES.md#not-verified-without-a-real-deployment) |
| Container behind Cloudflare | `cf-connecting-ip` |
| Container behind another proxy or load balancer | The header that proxy overwrites, for example `x-real-ip` (nginx with `proxy_set_header X-Real-IP $remote_addr`) or `x-forwarded-for` when exactly one proxy appends to it. Verify by sending a forged value and reading it back |
| Direct (nothing in front), or unknown | Leave it empty |

While it is empty no network identity is derived from the request, and the limits behave as follows:

- Comments and newsletter requests give each request a network bucket of its own, so the per-network limit never binds. Everything else still does: the per-visitor limits (signed guest cookie or account), the 5-minute resend cooldown per email address and the global request limit of the newsletter. A shared "unknown" bucket was rejected because one client could use up the limit for every visitor.
- On ChatGPT Sites `/api/health` lists `client-address-header` under `warnings` while it is empty in production. The status stays 200: a missing header weakens two limits and blocks nothing.
- The counters of the `events/subscribe` limiter (per signed-in account) are in memory, per process: with several instances the limit is multiplied by their number. The cap on live subscriptions per account is in the store and holds across instances.

## Local demo

```bash
pnpm install --frozen-lockfile
pnpm dev
```

No database, Docker daemon, or provider account is required. State resets when the process restarts.

## Reproduce Supabase locally

Prerequisites: Docker-compatible runtime and the Supabase CLI (a dev dependency of the repository; the commands below run it with `pnpm exec`). The committed `supabase/config.toml` defines the local stack.

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:status
```

`db reset --local` destroys only the local database, replays every committed migration, and then applies `supabase/seed.sql`. Copy the API URL and anon key printed by `supabase status` into `.env.local`, then restart Next.js.

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ATLASNEWS_CONTENT_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
MCP_ALLOWED_ORIGINS=http://localhost:3000
# Optional: editor sign-in and the newsroom tools of apps/mcp (export these in its shell):
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
# Optional CI and CLI credential for apps/mcp, attributed to this author:
ATLASNEWS_MCP_ADMIN_AUTHOR_ID=<existing-local-user-uuid>
ATLASNEWS_MCP_ADMIN_API_KEY=<openssl-rand-hex-32-output>
```

Stop the local stack without deleting data:

```bash
pnpm exec supabase stop
```

## Prepare remote Supabase

Create Preview and Production projects manually in the Supabase Dashboard. Select the database region closest to the hosts of `apps/mcp` and `apps/jobs`; the Sites runtime region is chosen by the platform.

Authenticate and link one environment at a time:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase migration list
pnpm exec supabase db push --dry-run
```

Before production migration:

- confirm the linked project reference in the command output;
- take or verify a recoverable database backup;
- review the dry-run and the SQL migration;
- confirm no production data exists only in Preview;
- run the repository quality gate.

Apply only after those checks:

```bash
pnpm exec supabase db push
```

Do not use `db reset --linked` on Production. Do not use `--include-seed` automatically on Production. The committed seed is deterministic demo/editorial content; if launch content is desired, review it as production data and apply it once through an explicit, audited operation. The studio needs at least one category for each authored locale, so an empty Production project must either receive reviewed localized categories or the approved category portion of the seed before the first article is created.

In Supabase **Authentication → URL Configuration**, set the production Site URL to the canonical HTTPS origin and allow these exact redirects:

```text
https://<canonical-host>/en/auth/callback
https://<canonical-host>/it/auth/callback
```

Add exact protected Preview callback origins only to the Preview Supabase project. Avoid a broad production wildcard. Keep email/password Auth enabled for the studio and public sign-up disabled.

### Sign-in with Google and GitHub

In `supabase` mode Google and GitHub sign-in is Supabase Auth's own: there are no `GOOGLE_*`, `GITHUB_*` or `ATLASNEWS_SESSION_SECRET` variables and no cookie of ours (those are for [Sites](SITES.md#sign-in-and-editors)). The site starts it at `/api/auth/<provider>/start`, which calls `signInWithOAuth` on the server, and the existing `/{locale}/auth/callback` finishes it. To turn it on:

1. Register an OAuth client with each provider, with the Supabase callback as redirect: `https://<project-ref>.supabase.co/auth/v1/callback` (Google: Cloud Console, Credentials, OAuth client ID, Web application; GitHub: Developer settings, OAuth Apps).
2. In Supabase **Authentication → Sign In / Providers** enable Google and GitHub with that client id and secret.
3. Keep `https://<canonical-host>/en/auth/callback` and `/it/auth/callback` in the redirect allow-list (above). No wildcard is needed: the page to come back to travels in a short-lived cookie, not in the URL.
4. Set `ATLASNEWS_SUPABASE_OAUTH_PROVIDERS=google,github` (the ones you enabled) so the site offers them; nothing is offered while it is empty.

Readers who sign in this way can comment as signed-in users but are not editors: the Studio still requires a `profiles` row with the `editor` or `admin` role, and a Google or GitHub sign-in from the Studio login page of a user without one is signed out again. Supabase links an identity to an existing user with the same verified email, so an editor invited by email can also sign in with Google or GitHub. A Google or GitHub account that is new to the project needs sign-ups allowed (**Authentication → Sign In / Providers**, "Allow new users to sign up"; `enable_signup` in `supabase/config.toml` for local work). New users get no profile, so they cannot reach the Studio. With sign-ups off, only users that already exist can sign in with a provider.

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

The first admin is created this way; after that an admin can invite editors, change roles and remove access from the Studio (**Team**) or with the `admin_*_editor` MCP tools, using the service-role key. Migration `20261015090000_team_management_grants.sql` gives that key the writes on `public.profiles` and `public.authors` it needs. An invitation creates the Auth user and sends Supabase's invite email; removing someone deletes only their `public.profiles` row. The invite email's link does not lead to a set-password page: the Studio login has no such step. Invited editors sign in with Google or GitHub (Supabase links the identity by verified email, see above), or an admin sets their password under **Authentication → Users**. Use `editor` for routine staff and reserve `admin` by operating convention. Both roles satisfy the same RLS editor predicate; only managing the team differs, and that is checked in the delivery layer (`newsroom.admin`), not by RLS. Any further permission split requires a migration and authorization tests. Remove access by deleting the `public.profiles` row; do not share Auth accounts. Public sign-up is disabled in the committed local Auth configuration and should remain disabled for an invite-only production studio.

## Deploy the three apps

| App | Host | Guide |
| --- | --- | --- |
| `apps/web` (reader site, Studio, OAuth consent page, comments, articles and health API, provider webhooks) | ChatGPT Sites | [SITES.md](SITES.md): build, environment variables, owner steps, what is not verified |
| `apps/mcp` (`POST /mcp`, `/info`, OAuth resource metadata) | Container | [HOSTING.md](HOSTING.md) |
| `apps/jobs` (`/internal/*` workers) | Container | [HOSTING.md](HOSTING.md) |

`apps/mcp` and `apps/jobs` read their configuration from the process environment, not from `.env` files. Set `NEXT_PUBLIC_MCP_URL` on `apps/web` and `apps/mcp` to the public origin of the MCP server, and point MCP clients at `https://<mcp-host>/mcp`; once a plugin is published that origin must not change. `/mcp` calls should finish well under 10 seconds.

Supabase Auth also serves the MCP sign-in. In the dashboard enable **Authentication, OAuth Server**, set the authorization path to `/oauth/consent` and the Site URL to the origin of `apps/web`; locally `[auth.oauth_server]` in `supabase/config.toml` already does this. [MCP.md](MCP.md#sign-in-with-supabase-auth) lists the hosts, registration and how to verify a deployment.

Register these provider callbacks at their exact production origins:

```text
POST https://<canonical-host>/api/webhooks/newsletter
GET|POST https://<canonical-host>/api/webhooks/social/whatsapp
```

Resend must sign the raw payload with the configured webhook secret. WhatsApp must pass both the verification challenge and signed POST validation. Do not put cron or webhook secrets in query strings.

`GET /api/health` is the deployment-readiness boundary. In production it returns `200` only when content mode is Supabase and the canonical origin is non-local HTTPS; it reports bounded check names (`checks`, blocking) and non-blocking `warnings`, never credentials.

## Schedule the workers

`apps/jobs` is a plain fetch handler with no scheduler of its own, so it runs on any host. Its schedule lives in each Supabase project: migration `20261012100000_job_schedule.sql` creates a `pg_cron` job, `atlasnews-jobs-dispatch`, that runs `private.dispatch_jobs()` every minute. The function reads two Supabase Vault secrets and asks `pg_net` to `POST` `/internal/social-outbox`, `/internal/newsletter-outbox`, `/internal/comment-notifications` and `/internal/mcp-events` with `Authorization: Bearer <secret>`. Until both secrets exist it does nothing, so the migration is safe to apply before `apps/jobs` is deployed. A second job, `atlasnews-job-run-details-cleanup`, prunes `cron.job_run_details` daily.

| Vault secret | Local Supabase | Preview | Production |
| --- | --- | --- | --- |
| `jobs_base_url` (origin only: scheme and host, optional port, no path or trailing slash) | `http://host.docker.internal:<free port>` (the database container reaches the host through it) | HTTPS origin of the preview `apps/jobs` | HTTPS origin of the production `apps/jobs` |
| `jobs_cron_secret` | Same value as `CRON_SECRET` in the local `apps/jobs` process | Same value as the preview `CRON_SECRET` | Same value as the production `CRON_SECRET` |

Vault is per project, so every environment sets its own values after the migration has run. The values are not in any migration and `anon` and `authenticated` cannot read Vault, `cron` or `private.dispatch_jobs()`. `service_role` can read Vault, as it can read every other table.

Setup, once per environment (SQL Editor or `psql` as `postgres`; deploy `apps/jobs` with the matching `CRON_SECRET` first, and never paste the real secret into a file or a ticket):

```sql
select vault.create_secret('https://jobs.example.com', 'jobs_base_url');
select vault.create_secret('<the CRON_SECRET of that apps/jobs>', 'jobs_cron_secret');
```

Rotate or repoint by updating the existing secrets, then change `CRON_SECRET` on `apps/jobs` in the same window (a request in between gets `401`, and the next minute recovers):

```sql
select vault.update_secret((select id from vault.secrets where name = 'jobs_cron_secret'), '<new secret>');
select vault.update_secret((select id from vault.secrets where name = 'jobs_base_url'), 'https://jobs.example.com');
```

Verify without waiting a minute:

```sql
select jobname, schedule, active from cron.job where jobname like 'atlasnews-%';
select private.dispatch_jobs();   -- 4 when configured, 0 when a secret is missing
select id, status_code, left(content, 100) as body, error_msg, created
from net._http_response order by id desc limit 8;   -- pg_net keeps responses for 6 hours
select status, return_message, start_time from cron.job_run_details order by runid desc limit 5;
```

Expected answers per endpoint: `200` with a JSON result, or the documented not-configured `503` (`cron_not_configured`/`not_configured` before `CRON_SECRET` is set on `apps/jobs`, `not_configured` for the newsletter without Resend settings, `comment_notifications_unavailable` and `mcp_events_not_configured` without the service-role key). `401` means the Vault secret differs from `CRON_SECRET`; `error_msg` of `Couldn't connect to server` or `Couldn't resolve host name` means `jobs_base_url` is wrong or `apps/jobs` is down.

Overlap is safe. `pg_net` calls are asynchronous and a minute can start before the previous one ended. Social, newsletter and comment rows are claimed with `FOR UPDATE SKIP LOCKED` and a lease; MCP event deliveries are claimed the same way and are unique per subscription and article, so duplicate or concurrent triggers do no extra work.

Stop the schedule without losing the settings: `select cron.alter_job((select jobid from cron.job where jobname = 'atlasnews-jobs-dispatch'), active := false);` and the same with `active := true` to resume.

## Release order

1. `pnpm install --frozen-lockfile && pnpm check` at the release commit.
2. Supabase backup/readiness check.
3. `supabase db push --dry-run`, then `supabase db push`.
4. Deploy `apps/web` to Sites and `apps/mcp` and `apps/jobs` as containers, each with its environment-specific variables.
5. Vault secrets for the worker schedule ([Schedule the workers](#schedule-the-workers)).
6. Post-deploy smoke checks below.
7. Publish editorial content only after the platform checks pass.

## Post-deploy smoke checks

Replace `$SITE` with the canonical origin of `apps/web` and `$MCP` with the origin of `apps/mcp`.

```bash
curl --fail --silent --show-error --location "$SITE/en" >/dev/null
curl --fail --silent --show-error --location "$SITE/it" >/dev/null
curl --fail --silent --show-error "$SITE/api/health" | grep '"status":"ready"'
curl --fail --silent --show-error "$SITE/en/feed.xml" | grep '<language>en</language>'
curl --fail --silent --show-error "$SITE/it/feed.xml" | grep '<language>it</language>'
curl --fail --silent --show-error "$MCP/info" | grep '"name":"atlasnews"'
```

Then verify in a browser:

- `/` redirects to `/en`;
- English and Italian navigation switch without losing the current content context;
- home, category, search, and article pages render real Supabase content;
- editor sign-in rejects an unprofiled Auth user and accepts the bootstrapped editor;
- a draft is not visible anonymously;
- a newly published article becomes visible after cache revalidation;
- newsletter submission sends a double-opt-in message, confirmation activates exactly once, and unsubscribe cancels queued recipients;
- a comment is persisted as pending, moderation publishes it, report/audit are visible only to editors, and notification links mutate only after POST confirmation;
- social share links encode the canonical article URL; Studio social enqueue never sends inline and its outbox later records the provider receipt;
- localized RSS contains only published rows for its requested language;
- MCP `server/discover`, `list_articles` and `list_comments` return only public data when anonymous; a legacy initialize probe remains compatible.
- the MCP sign-in works as in [MCP.md](MCP.md#verify-a-deployment): a scoped tool without a token answers 401 with a Bearer challenge, an invalid token answers 401, and a signed-in editor can list the newsroom tools' data. Use previews/disposable drafts and do not process external outboxes during a smoke test.

See [OPERATIONS.md](OPERATIONS.md) for rollback and incident procedures.
