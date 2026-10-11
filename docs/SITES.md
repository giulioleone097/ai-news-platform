# Deploying AtlasNews on ChatGPT Sites

ChatGPT Sites is the default deployment, and it needs no Supabase. One Worker built from `apps/web` serves everything: the reader site and the Studio, the MCP server at `/mcp`, and the background workers. Records live in the Site's own D1 database, uploads in its R2 bucket, and editors sign in with ChatGPT. This is `ATLASNEWS_CONTENT_MODE=sites` ([SITES_DATA.md](SITES_DATA.md) has the data layer).

The Supabase deployment stays available and complete for leaving Sites: `ATLASNEWS_CONTENT_MODE=supabase` with the MCP server and the workers as containers ([DEPLOYMENT.md](DEPLOYMENT.md), [HOSTING.md](HOSTING.md)). Both backends implement the same core ports; switching is configuration, not code. Moving existing content between them is not automated.

Verified locally only (Miniflare D1/R2 and `workerd`); nothing was deployed. See [Not verified without a real deployment](#not-verified-without-a-real-deployment).

## How the build works

Sites does not run Next.js itself. It runs a Worker. [`vinext`](https://github.com/cloudflare/vinext) re-implements the Next.js App Router on Vite and emits that Worker; it is also what OpenAI's own Sites Next.js starter uses. The app source is unchanged: the same `src/` serves both builds.

| | Plain Next.js build | Sites build |
| --- | --- | --- |
| Command (repo root) | `pnpm build` | `pnpm build:sites` |
| Command (in `apps/web`) | `pnpm build:next` | `pnpm build` |
| Tool | `next build` | `vinext build` (Vite 8, `@cloudflare/vite-plugin`) |
| Output | `apps/web/.next` | `apps/web/dist` |
| Used for | the performance budget, `next start`, local review | the thing that ships |

`pnpm check` runs both: the plain build and `perf:budget` first, then `build:sites`. The Sites step ends with `next typegen` because `vinext build` overwrites `apps/web/.next/types/routes.d.ts` and `next-env.d.ts`, which would break the next `tsc` run.

Files that make it work:

| File | Role |
| --- | --- |
| `apps/web/vite.config.ts` | vinext, Cloudflare and Sites plugins, local D1/R2 stand-ins, defaults the mode to `sites`, lists the pre-sized media widths for the image redirect |
| `apps/web/build/sites-vite-plugin.ts` | OpenAI's Sites Vite plugin (MIT, vendored unchanged): copies `.openai/hosting.json` and `drizzle/` to `dist/.openai/`, simulates Sign in with ChatGPT on loopback in `vinext dev` |
| `apps/web/build/sites-worker.ts` | Worker entry (`export default { fetch }`): hands the bindings to the adapters, routes `/mcp` to the MCP server and `/internal/*` to the workers, runs due jobs in the background, redirects `/_next/image` for pre-sized media |
| `apps/web/.openai/hosting.json` | Sites manifest: `project_id` (set after the Site exists), `"d1": "DB"`, `"r2": "BUCKET"`, `"capabilities": ["mcp"]` |
| `apps/web/drizzle/` | D1 schema migrations, applied by Sites before each deployment ([SITES_DATA.md](SITES_DATA.md)) |
| `apps/web/next.config.ts` | read by both builds, holds the production guard ([below](#build-guard)) |
| `apps/web/src/app/not-found.tsx`, `global-not-found.tsx` | HTML 404 page, both languages (`experimental.globalNotFound`) |

### The Sites build contract

From the installed Sites plugin (`~/.codex/plugins/cache/openai-curated-remote/sites/1.0.0/`: `scripts/build-site.mjs`, `skills/sites/scripts/package-site.sh`, `skills/sites/scripts/prepare-site-build.cjs`, `skills/sites/SKILL.md`) and OpenAI's Sites docs (`learn.chatgpt.com/docs/sites`, help article 20001339):

- The project root is the folder that holds `.openai/hosting.json` and a `package.json` with a `build` script. The tooling picks the package manager from that folder alone (`scripts/package-manager.mjs`), then installs and runs the `build` script with it. Here that folder is `apps/web`.
- A Worker build must produce `dist/server/index.js` (an ES module with `export default { fetch(request, env, ctx) }`), `dist/client/` (static assets, served by the platform) and `dist/.openai/hosting.json`. `dist/` must contain no symlinks. The build here also writes `dist/server/wrangler.json` (`compatibility_date 2026-05-15`, flag `nodejs_compat`, assets from `../client`).
- Packaging is `tar -czf archive dist`. The archive and the commit SHA go to the native Sites save and deploy calls. The Sites plugin does this when you ask it to deploy.
- Runtime facts OpenAI states: Cloudflare Workers, 128 MB per isolate, HTTP, HTTPS and WebSockets only (no raw TCP). Size and CPU limits are not published.
- The platform owns `/signin-with-chatgpt`, `/signout-with-chatgpt` and `/callback`. The site links to the first two for editors ([below](#sign-in-and-editors)) and never serves them.

Measured before the Sites content mode (demo build): `dist/server` 3.4 MiB in 256 files (JS 2.46 MB raw, 0.73 MB gzip, `index.js` 344 KB), `dist/client` 1.7 MiB in 96 files, archive made by the plugin's own `package-site.sh` 1.6 MB, no symlinks.

Versions pinned in `apps/web/package.json` (the set the spike proved against OpenAI's starter): `vinext 1.0.0-beta.5`, `vite 8.0.13`, `@vitejs/plugin-react 6.0.2`, `@vitejs/plugin-rsc 0.5.26`, `react-server-dom-webpack 19.2.8` (must equal `react`), `@cloudflare/vite-plugin 1.37.1`, `@cloudflare/workers-types 4.20260702.1`, `wrangler 4.92.0`. `next` stays at `16.3.0`; vinext has no peer range on it and the build works with it. vinext 1.1.0 exists and was not tried; upgrade only with a full re-check.

## What runs on the Site

| Part | Where on Sites | Self-hosted equivalent |
| --- | --- | --- |
| Reader site, Studio, public API (`apps/web`) | every path not listed below | `next start` or the same Worker |
| MCP server (`apps/mcp`) | `/mcp`, `/info`, `/.well-known/openai-apps-challenge` | `apps/mcp` container |
| Workers (`apps/jobs`): social outbox, newsletter, comment notifications, MCP events | in the background of requests, and `/internal/*` | `apps/jobs` container + `pg_cron` |
| Data | D1 (`DB`), R2 (`BUCKET`) | Supabase Postgres and Storage |
| Sign-in | Sign in with ChatGPT | Supabase Auth |

### Sign-in and editors

Sites owns sign-in. The Studio's login page links to `/signin-with-chatgpt?return_to=…` (a top-level navigation) and sign-out posts to `/signout-with-chatgpt`. For a signed-in visitor the platform adds `oai-authenticated-user-id`, `oai-authenticated-user-email` and the encoded full name to each request; `packages/adapters/src/sites/editors.ts` turns them into an editor:

- An account whose email is in `ATLASNEWS_ADMIN_EMAILS` becomes an admin, one in `ATLASNEWS_EDITOR_EMAILS` an editor, each with its own author, the first time it signs in. The row then belongs to that ChatGPT account: another account with the same email gets nothing, and removing the address from the list does not revoke it.
- A row in `editors` with an email and no user id is an invitation and binds the same way.
- Every other account is a reader: the login page says it is not an editor and offers to switch account. Readers can still comment as signed-in users.

D1 has no row-level security, so the Studio receives its repositories only after the editor check (`apps/web/src/server/composition.ts`), and the MCP server maps the same editor to its scopes (`apps/mcp/src/auth.ts`).

### MCP server

The `mcp` capability in `hosting.json` tells Sites the Site serves an MCP endpoint at `/mcp`. Sites handles the OAuth for MCP clients and forwards the same identity headers, so editor tools work for the editor signed in through the client, and anonymous clients get the read tools. Sites can create a private ChatGPT plugin for the Site (`get_site` with `include_mcp_connection`, then `suggest_plugins`). Other MCP clients connect to `https://<site>/mcp`.

### Background jobs

Sites has no cron. The Worker calls `runDueJobsOnSites` (`apps/jobs/src/scheduled.ts`) in `ctx.waitUntil` after each request: each isolate looks every 30 seconds at most, and a lease in D1 (`job_leases`) lets one run start per minute across all isolates. A Site without traffic runs its jobs when the next request arrives. For a fixed rhythm, set `CRON_SECRET` and call `POST /internal/<job>` from an external scheduler (a Sites schedule or any cron), as [DEPLOYMENT.md](DEPLOYMENT.md#schedule-the-workers) describes for the containers.

### Caching

`POST /api/revalidate` and `revalidatePath` / `updateTag` act only on the isolate that receives them. Pages with `revalidate` (60 s for home, latest, categories, status, entities; 300 s for articles) are cached in isolate memory, so another isolate shows a change after at most its own TTL.

## Environment variables

Set them in the Site settings (More actions, Settings; owner only), never in files or `hosting.json`, then redeploy. Names and meaning are in [`.env.example`](../.env.example).

Build time (frozen into the bundles; a change needs a new deployment):

| Variable | Why |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | canonical origin: metadata, sitemap, feeds, `/api/health`, the MCP origin. Measured: a runtime value does not override the built one |

If the Sites build cannot see the Site settings, put it in `apps/web/.env.production` (verified: the vinext build reads it). `.gitignore` excludes `.env*`, so add that one file on purpose. `ATLASNEWS_CONTENT_MODE` needs no value: the Sites build defaults it to `sites`, and at run time the `DB` binding selects it.

Runtime:

| Variable | Required | Why |
| --- | --- | --- |
| `ATLASNEWS_ADMIN_EMAILS` | yes | the ChatGPT account(s) that become admins at first sign-in |
| `ATLASNEWS_EDITOR_EMAILS` | optional | accounts that become editors at first sign-in |
| `ATLASNEWS_COMMENT_GUEST_SECRET` | yes | signs guest commenter identities (`openssl rand -hex 32`) |
| `ATLASNEWS_CLIENT_IP_HEADER` | yes | `cf-connecting-ip`; keys the per-network limits of comments, newsletter and MCP events |
| `NEXT_PUBLIC_SITE_URL` | yes | same value as at build time; the server and the MCP server read it at run time |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NEWSLETTER_FROM_EMAIL`, `NEWSLETTER_REPLY_TO`, `NEWSLETTER_UNSUBSCRIBE_SECRET` | for the newsletter and comment emails | Resend delivery |
| `LINKEDIN_*`, `X_USER_ACCESS_TOKEN`, `WHATSAPP_*` | for social publishing | provider credentials |
| `CRON_SECRET` | only for an external schedule | guards `/internal/*` |
| `ATLASNEWS_MCP_ADMIN_API_KEY` | optional | Bearer key for CI or scripts calling the newsroom tools without ChatGPT sign-in |
| `ATLASNEWS_OPENAI_APPS_CHALLENGE`, `ATLASNEWS_MCP_UI_DOMAIN` | for public plugin submission | [AGENT_PLUGIN.md](AGENT_PLUGIN.md) |

Not used on Sites: every `SUPABASE_*` and `NEXT_PUBLIC_SUPABASE_*` variable, `NEXT_PUBLIC_MCP_URL` (defaults to the site origin), `ATLASNEWS_MCP_OAUTH_*`, `ATLASNEWS_OAUTH_REDIRECT_HOSTS`, `ATLASNEWS_REVALIDATE_SECRET` (the MCP server runs in the same Worker). `GET /api/health` reports the mode and lists every capability still unconfigured; it answers 503 until all are.

### Package manager

The repository is a pnpm workspace (`pnpm-workspace.yaml`, one `pnpm-lock.yaml` at the root). What the Sites plugin does with it, read from `scripts/package-manager.mjs`, `install-dependencies.mjs` and `build-site.mjs`, and run for real from `apps/web`:

- It reads only the `package.json` in the project folder (`apps/web`) and the lockfiles in that same folder. The `packageManager` field decides; without it, and without a lockfile or `pnpm-workspace.yaml` in `apps/web` (the repository's are one level up), it falls back to npm. That is why `apps/web/package.json` carries `"packageManager": "pnpm@12.11.2"` as well as the root one. Keep the two in step when upgrading pnpm.
- It installs with `pnpm install` (`--frozen-lockfile` only if the project folder itself holds a lockfile, so not here; CI environments freeze by default). pnpm finds the workspace root above `apps/web` and installs the whole workspace from the root lockfile; the lockfile came out unchanged. A workspace root above the project folder is therefore supported, a folder copied out of the repository is not.
- It builds with `pnpm run build`, which is `vinext build`. The output has no symlinks (the fonts are copied under `dist/client/_next/static/media`), the layout above, and `package-site.mjs` accepts it.
- Only a project that declares exactly `pnpm@11.25.0` gets the ChatGPT image's private pnpm (`SITES_PNPM_BIN`) or Corepack. Any other pin, including this repository's, runs the `pnpm` on `PATH`. A global pnpm 11 switches to the pinned 12.11.2 by itself (checked with pnpm 11.24.0; it downloads once). Whether the managed Linux environment of the ChatGPT app has a `pnpm` on `PATH` was not checked; if it has not, pin `pnpm@11.25.0` in both `package.json` files, which is what that image ships.

The dependencies' install scripts are blocked by default in pnpm. None of them is needed for the Sites build or for the local `workerd` run: `esbuild`, `sharp`, `unrs-resolver` and `workerd` stay denied (see `allowBuilds` in `pnpm-workspace.yaml`).

### Build guard

`next.config.ts` runs in both builds (verified: a failing guard stops `vinext build` and `next build`). A production build whose `NEXT_PUBLIC_SITE_URL` is a public HTTPS origin, or whose Supabase URL is a hosted one, must use `sites` or `supabase` (never demo data) and a non-local HTTPS canonical origin; `supabase` also needs a valid hosted Supabase URL and key. Demo builds (CI, local review) are not affected.

## What the owner does in ChatGPT

Only the owner can publish the first version and change the audience, URL, secrets and domain. Sites is in public beta on Plus, Pro, Business, Enterprise and Edu, from Work chats on ChatGPT web or Work/Codex in the ChatGPT desktop app. The step-by-step handoff for ChatGPT is kept with the project files (`handoff/chatgpt-deploy.md`); in short:

1. Clone the repository and install from the root: `pnpm install --frozen-lockfile` (`apps/web` cannot be built from a copy of the folder alone, see [Package manager](#package-manager)).
2. Ask `@Sites` to deploy the project in `apps/web` as it is with `pnpm run build`. The plugin registers the Site, writes `project_id` into `apps/web/.openai/hosting.json` (commit it), provisions D1 and R2, applies the migrations, builds, packages and deploys.
3. Set the variables above in the Site settings and redeploy.
4. Open the Site, sign in with an `ATLASNEWS_ADMIN_EMAILS` account at `/en/login`, and check `/api/health`, the Studio and `/mcp`.
5. Optional: custom domain (Settings, Add domain; then set `NEXT_PUBLIC_SITE_URL` to it and redeploy), audience public, private ChatGPT plugin for `/mcp`.

## Local development with Sites behaviour

Build once, give the local D1 its schema, then run the artifact with the bindings (`--persist-to` keeps the data between runs):

```sh
cd apps/web
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4410 pnpm build
for file in drizzle/0*.sql; do
  pnpm exec wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file "$file" -y
done
WRANGLER_SEND_METRICS=false pnpm exec wrangler dev --config dist/server/wrangler.json --local \
  --persist-to .wrangler/state --ip 127.0.0.1 --port 4410 --inspector-port 0 \
  --var ATLASNEWS_ADMIN_EMAILS:owner@example.com --var NEXT_PUBLIC_SITE_URL:http://127.0.0.1:4410 \
  --var ATLASNEWS_COMMENT_GUEST_SECRET:$(openssl rand -hex 32)
```

Nothing signs you in locally: send the headers the platform would add, for example `curl -H 'oai-authenticated-user-id: u-owner' -H 'oai-authenticated-user-email: owner@example.com' http://127.0.0.1:4410/en/studio`. In `vinext dev` the vendored Sites plugin simulates the sign-in pages instead, as `seedy@sites.test`. Checked this way: pages in both languages, the Studio for an admin (a reader is sent to the login page, which says it is not an editor), MCP `tools/list`, a 401 challenge for an anonymous editor tool, category and article create and publish through MCP, search, the article page with Markdown, a cover upload served from `/media-store/`, a guest comment and the moderation queue (401 anonymous, 403 reader, 200 admin), `/internal/mcp-events` with and without `CRON_SECRET`, and the background job lease.

A new Site starts empty: migrations hold no seed rows. The first admin creates the categories (Studio or the `admin_create_category` tool) before the first article. Pages cached with `revalidate` show a write after their TTL (60 s for lists), because the MCP server cannot reach the isolate cache of the page that served earlier.

## Running the artifact locally

```sh
cd apps/web
ATLASNEWS_CONTENT_MODE=demo NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4410 pnpm build
WRANGLER_SEND_METRICS=false pnpm exec wrangler dev --config dist/server/wrangler.json \
  --local --ip 127.0.0.1 --port 4410 --inspector-port 0 \
  --var ATLASNEWS_CONTENT_MODE:demo --var NEXT_PUBLIC_SITE_URL:http://127.0.0.1:4410
```

`wrangler dev --local` needs no account. `dist/` is self-contained: it also ran from a copy outside the repository. Do not rebuild `dist/` while a server runs from it; the server then reads chunks of the new build and fails with missing-module errors or 404s on `_next/static`. `vinext start` serves the same `dist/` on Node and is fine for a quick look.

## Differences from the plain Next build

Measured locally on the demo build, phone viewport (390 px, device pixel ratio 3):

- `/_next/image` does not resize on Sites; vinext answers with a redirect to the original. The home page's lead thumbnail (`/media/neura-agents-hero.webp`) therefore downloaded 129,446 B instead of 4,047 B. `build/sites-worker.ts` now redirects `/_next/image` for local media that ship pre-sized (`/media/<name>-{480,672,750,1200,1536}.webp`) to the smallest variant that is wide enough: 14,045 B on the home page (4,047 B on plain Next, 129,446 B before the fix). The article page is the same on both builds (16.6 KB; the bundled hero already uses a `<picture>` of pre-sized files). Covers uploaded in the Studio (R2, served at `/media-store/<file>`) are still delivered at full size: the Worker cannot resize them. Fix when it matters: pre-sized uploads in Studio.
- A `q` that Next would reject (for example `q=80`) is answered with the redirect for pre-sized media instead of 400.
- `og:locale:alternate` is not emitted (vinext ignores `alternateLocale`).
- `experimental.inlineCss` is ignored: CSS is a linked 39 KB file, not inlined, so the first paint differs slightly and the plain build's CSS budget does not apply to this artifact.
- `<meta>` tags are rendered without the self-closing slash.
- ISR is per isolate (above); on `next start` it is per process.
- Visible text is identical on the 11 pages compared (`/en`, `/it`, latest, article, status, entities, entity, search, login, `/oauth/consent`, 404).
- `dist/server/vinext-server.json` holds a build-generated `prerenderSecret`. It is an artifact value, not a repository secret. It is not served (404 under `dist/client` paths), and the `/__vinext/prerender/*` endpoints answer 404 without the secret and with a wrong one (checked in `workerd`).
- Response headers. `next.config.ts` `headers()` reaches the Sites artifact as it does `next start` (checked in `workerd`): `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: SAMEORIGIN`. For `/oauth/*`, `/{locale}/studio/*`, `/{locale}/login` and `/{locale}/auth/*` the config adds `Content-Security-Policy: frame-ancestors 'none'` and `src/proxy.ts` (which both builds run) sets `X-Frame-Options: DENY`. Two config rules with the same header for one path are resolved differently (Next: the later rule wins; vinext: the first), so the sensitive rule adds a different header instead of overriding, and vinext does not honour a negative lookahead in a `source`: do not exclude paths that way. `Cache-Control` of dynamic pages (`no-store, must-revalidate`) is vinext's.
- The demo Studio is off on the artifact: `NODE_ENV` is folded to `production` at build time, so `isDemoStudioEnabled()` is true only with `ATLASNEWS_ENABLE_DEMO_STUDIO=true`. An unauthenticated `GET /en/studio` answers 307 to `/en/login`. The guard no longer treats an unset `NODE_ENV` as development either.

## Not verified without a real deployment

1. That Sites accepts and runs this artifact end to end, provisions D1 and R2 from `hosting.json` and applies `dist/.openai/drizzle` before the upload.
2. That the platform strips client-sent `oai-authenticated-*` headers before adding its own. The code relies on it, as OpenAI's starter does.
3. How MCP clients other than ChatGPT authenticate to a Site's `/mcp` (anonymous read tools do not need it).
4. How the ChatGPT app treats a monorepo project root. The plugin's own install, build and package scripts worked from `apps/web` in a full checkout; a copy of `apps/web` alone fails to install. The managed environment's pnpm was not checked (see [Package manager](#package-manager)).
5. Whether Sites passes variables to the build step, or only to the runtime. If only to the runtime, use `.env.production`.
6. Platform limits: Worker size, startup and request CPU, subrequests per request, request body size (the Studio upload allows 9 MB), D1 and R2 plan limits.
7. Background jobs driven by traffic on a real Site, and provider sends (Resend, LinkedIn, X, WhatsApp) with real credentials.
8. Behaviour of `vinext 1.0.0-beta.5` on routes the checks did not time (ISR expiry), and any upgrade to vinext 1.1.0.
