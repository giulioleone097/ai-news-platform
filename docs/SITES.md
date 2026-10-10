# Deploying the reader site on ChatGPT Sites

`apps/web` (the reader site, Studio and the public API routes) is built as a Next.js app and runs on ChatGPT Sites as a Cloudflare-style Worker. Content stays in Supabase over HTTPS: `apps/web/.openai/hosting.json` declares no D1 and no R2. The background workers and the MCP server do not run on Sites ([below](#what-does-not-run-on-sites)).

Everything here was verified locally in `workerd` (`wrangler dev --local`). Nothing was deployed. See [Not verified without a real deployment](#not-verified-without-a-real-deployment).

## How the build works

Sites does not run Next.js itself. It runs a Worker. [`vinext`](https://github.com/cloudflare/vinext) re-implements the Next.js App Router on Vite and emits that Worker; it is also what OpenAI's own Sites Next.js starter uses. The app source is unchanged: the same `src/` serves both builds.

| | Plain Next.js build | Sites build |
| --- | --- | --- |
| Command (repo root) | `npm run build` | `npm run build:sites` |
| Command (in `apps/web`) | `npm run build:next` | `npm run build` |
| Tool | `next build` | `vinext build` (Vite 8, `@cloudflare/vite-plugin`) |
| Output | `apps/web/.next` | `apps/web/dist` |
| Used for | the performance budget, `next start`, local review | the thing that ships |

`npm run check` runs both: the plain build and `perf:budget` first, then `build:sites`. The Sites step ends with `next typegen` because `vinext build` overwrites `apps/web/.next/types/routes.d.ts` and `next-env.d.ts`, which would break the next `tsc` run.

Files that make it work:

| File | Role |
| --- | --- |
| `apps/web/vite.config.ts` | vinext + Cloudflare plugins, copies `.openai/hosting.json` to `dist/.openai/`, lists the pre-sized media widths for the image redirect |
| `apps/web/build/sites-worker.ts` | Worker entry (`export default { fetch }`), plus the `/_next/image` redirect for pre-sized media |
| `apps/web/.openai/hosting.json` | Sites manifest: `project_id` (set after the Site exists), `d1: null`, `r2: null` |
| `apps/web/next.config.ts` | read by both builds, holds the production guard ([below](#build-guard)) |
| `apps/web/src/app/not-found.tsx`, `global-not-found.tsx` | HTML 404 page, both languages (`experimental.globalNotFound`) |

### The Sites build contract

From the installed Sites plugin (`~/.codex/plugins/cache/openai-curated-remote/sites/1.0.0/`: `scripts/build-site.mjs`, `skills/sites/scripts/package-site.sh`, `skills/sites/scripts/prepare-site-build.cjs`, `skills/sites/SKILL.md`) and OpenAI's Sites docs (`learn.chatgpt.com/docs/sites`, help article 20001339):

- The project root is the folder that holds `.openai/hosting.json` and a `package.json` with a `build` script. The tooling runs `npm run build` there. Here that folder is `apps/web`.
- A Worker build must produce `dist/server/index.js` (an ES module with `export default { fetch(request, env, ctx) }`), `dist/client/` (static assets, served by the platform) and `dist/.openai/hosting.json`. `dist/` must contain no symlinks. The build here also writes `dist/server/wrangler.json` (`compatibility_date 2026-05-15`, flag `nodejs_compat`, assets from `../client`).
- Packaging is `tar -czf archive dist`. The archive and the commit SHA go to the native Sites save and deploy calls. The Sites plugin does this when you ask it to deploy.
- Runtime facts OpenAI states: Cloudflare Workers, 128 MB per isolate, HTTP, HTTPS and WebSockets only (no raw TCP). Size and CPU limits are not published.
- The platform owns `/signin-with-chatgpt`, `/signout-with-chatgpt` and `/callback`. The site does not use them.

Measured on the current tree (demo build): `dist/server` 3.4 MiB in 256 files (JS 2.46 MB raw, 0.73 MB gzip, `index.js` 344 KB), `dist/client` 1.7 MiB in 96 files, archive made by the plugin's own `package-site.sh` 1.6 MB, no symlinks.

Versions pinned in `apps/web/package.json` (the set the spike proved against OpenAI's starter): `vinext 1.0.0-beta.5`, `vite 8.0.13`, `@vitejs/plugin-react 6.0.2`, `@vitejs/plugin-rsc 0.5.26`, `react-server-dom-webpack 19.2.8` (must equal `react`), `@cloudflare/vite-plugin 1.37.1`, `@cloudflare/workers-types 4.20260702.1`, `wrangler 4.92.0`. `next` stays at `16.3.0`; vinext has no peer range on it and the build works with it. vinext 1.1.0 exists and was not tried; upgrade only with a full re-check.

## Environment variables

The Sites build runs `npm run build` in `apps/web`, so the values the build needs must be visible to that command. Everything else is set in the Site settings (More actions, Settings; owner only), never in files or `hosting.json`. After a change, redeploy.

Build time (frozen into the bundles; changing one needs a new deployment):

| Variable | Why |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | canonical origin: metadata, sitemap, feeds, `/api/health`. Measured: a runtime value does not override the built one |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | inlined into the browser bundle (login, Studio) |
| `ATLASNEWS_CONTENT_MODE=supabase` | read by the [build guard](#build-guard) |

If the Sites build cannot see variables set in the Site settings, put the three public values and the mode in `apps/web/.env.production` (verified: the vinext build reads it and the guard sees it). The URL and the anon key are public by design, but `.gitignore` excludes `.env*`, so un-ignore the file on purpose.

Runtime (Site settings): `ATLASNEWS_CLIENT_IP_HEADER=cf-connecting-ip` (keys the per-network comment and newsletter limits; empty switches them off, see [DEPLOYMENT.md](DEPLOYMENT.md#client-address-and-rate-limits)), `ATLASNEWS_OAUTH_REDIRECT_HOSTS` (optional, the consent page's redirect allowlist), `ATLASNEWS_CONTENT_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the server reads them at run time; verified in `workerd`), `SUPABASE_SERVICE_ROLE_KEY`, `ATLASNEWS_COMMENT_GUEST_SECRET`, `ATLASNEWS_REVALIDATE_SECRET`, `ATLASNEWS_MCP_ADMIN_API_KEY`, `ATLASNEWS_MCP_ADMIN_AUTHOR_ID`, `MCP_ALLOWED_ORIGINS`, `NEXT_PUBLIC_MCP_URL`, and the optional newsletter, WhatsApp, LinkedIn and X values. Names, meaning and which are required are in [`.env.example`](../.env.example) and [DEPLOYMENT.md](DEPLOYMENT.md). `GET /api/health` lists what is still missing and returns 503 until the deployment is ready.

### Build guard

`next.config.ts` runs in both builds (verified: a failing guard stops `vinext build` and `next build`). For a production build it applies when `NEXT_PUBLIC_SITE_URL` is a public HTTPS origin or `NEXT_PUBLIC_SUPABASE_URL` is a hosted HTTPS origin. Then it requires `ATLASNEWS_CONTENT_MODE=supabase`, a valid Supabase URL and key, a non-local HTTPS Supabase origin and a non-local HTTPS canonical origin, so a public build cannot ship demo data or localhost metadata. Demo builds (CI, local review) and local-Supabase builds are not affected. A build with no variables at all is a demo build and passes; `/api/health` returning 503 `not-ready` is what catches a deployment that forgot its environment.

## What the owner does in ChatGPT

Only the owner can publish the first version, change the audience, the URL, secrets and the domain. Sites is in public beta on Plus, Pro, Business, Enterprise and Edu. Requires Work chats on ChatGPT web or Work/Codex in the ChatGPT desktop app.

1. On the machine that will run the build, clone the repository and install from the root: `npm ci`. The Sites build resolves the `@atlasnews/*` workspace packages from the root `node_modules`, so `apps/web` cannot be built from a copy of the folder alone (see the unverified list).
2. In ChatGPT (Work, or Codex in the desktop app), open the repository and ask: `@Sites deploy the project in apps/web as it is, with npm run build; do not change the code`. The plugin registers the Site (private, unpublished), writes the returned `project_id` into `apps/web/.openai/hosting.json`, runs `npm run build`, packages `dist/`, and saves and deploys a version. Commit the `project_id` change.
3. Open `chatgpt.com/sites`, pick the Site, More actions, Settings. Set the runtime variables above. If build-time variables are supported there, set the build-time ones too, with `NEXT_PUBLIC_SITE_URL` set to the Site URL (or the custom domain, see 5).
4. Ask Sites to rebuild and redeploy the saved version. Check `https://<site>/api/health` returns 200 with `"status":"ready"`, then open `/en`, `/it`, an article and `/en/feed.xml`.
5. Custom domain: Settings, Add domain, enter the apex or subdomain you own, and create the DNS records Sites shows. Sites does not register domains and the option is not available in Enterprise workspaces at launch. Then set `NEXT_PUBLIC_SITE_URL` to the new origin, redeploy (it is built in), and update the Supabase Auth site URL and redirect URLs, `MCP_ALLOWED_ORIGINS`, and anything else that names the old host (the MCP server's `NEXT_PUBLIC_SITE_URL`, which `apps/mcp` uses for links and revalidation).
6. Audience: new Sites are private. To publish, change the audience to anyone on the internet (an Enterprise workspace admin must allow that). Enterprise network policies must allow the Supabase hostname (`*.supabase.co` or your custom domain); raw TCP is blocked in every policy.

Local equivalent of step 2, with the plugin's own scripts (build, then package; no deploy): from `apps/web`, `npm run build`, then `bash ~/.codex/plugins/cache/openai-curated-remote/sites/1.0.0/skills/sites/scripts/package-site.sh "$PWD" /tmp/atlasnews-sites.tar.gz`.

## Running the artifact locally

```sh
cd apps/web
ATLASNEWS_CONTENT_MODE=demo NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4410 npm run build
WRANGLER_SEND_METRICS=false ../../node_modules/.bin/wrangler dev --config dist/server/wrangler.json \
  --local --ip 127.0.0.1 --port 4410 --inspector-port 0 \
  --var ATLASNEWS_CONTENT_MODE:demo --var NEXT_PUBLIC_SITE_URL:http://127.0.0.1:4410
```

`wrangler dev --local` needs no account. `dist/` is self-contained: it also ran from a copy outside the repository. Do not rebuild `dist/` while a server runs from it; the server then reads chunks of the new build and fails with missing-module errors or 404s on `_next/static`. `vinext start` serves the same `dist/` on Node and is fine for a quick look.

## What does not run on Sites

- `apps/jobs` (newsletter delivery, social publishing, outbox workers) and `apps/mcp` (the MCP server) are Node processes. They run from the container image described in [HOSTING.md](HOSTING.md); the schedule that calls the workers is Supabase `pg_cron`, see [DEPLOYMENT.md](DEPLOYMENT.md#schedule-the-workers).
- There is no cron or background work inside the Site, and nothing durable besides Supabase: no D1, no R2, no KV.
- `POST /api/revalidate` and `revalidatePath` / `updateTag` act only on the isolate that receives them. Pages with `revalidate` (60 s for home, latest, categories, status, entities; 300 s for articles) are cached in isolate memory, so another isolate shows a change after at most its own TTL. Pages are never stale for longer than that.

## Differences from the plain Next build

Measured locally on the demo build, phone viewport (390 px, device pixel ratio 3):

- `/_next/image` does not resize on Sites; vinext answers with a redirect to the original. The home page's lead thumbnail (`/media/neura-agents-hero.webp`) therefore downloaded 129,446 B instead of 4,047 B. `build/sites-worker.ts` now redirects `/_next/image` for local media that ship pre-sized (`/media/<name>-{480,672,750,1200,1536}.webp`) to the smallest variant that is wide enough: 14,045 B on the home page (4,047 B on plain Next, 129,446 B before the fix). The article page is the same on both builds (16.6 KB; the bundled hero already uses a `<picture>` of pre-sized files). Covers uploaded to Supabase Storage are still delivered at full size: the Worker cannot resize them. Fix when it matters: Supabase image transformations or pre-sized uploads in Studio.
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

1. That Sites accepts and runs this artifact end to end. Only the plugin's `package-site.sh` (which runs the same layout checks as the packaging step) and a local `workerd` were used.
2. How the ChatGPT app treats a monorepo project root. `apps/web` depends on `@atlasnews/core`, `contract` and `adapters`. The plugin's `install-dependencies.mjs` runs a plain `npm ci` or `npm install` in `apps/web`, which npm resolves to the workspace root (checked: `npm prefix` there is the repository root), so a full checkout works. A Site created from a copy of `apps/web` alone would fail to install.
3. Whether Sites passes variables to the build step, or only to the runtime. If only to the runtime, use `.env.production`.
4. Platform limits: Worker size, startup CPU, request CPU and time, subrequests per request, request body size. The Studio media upload action allows 9 MB (`serverActions.bodySizeLimit`); vinext honouring that limit was not tested.
5. That Sites deploys with the `compatibility_date` and `nodejs_compat` flag of `dist/server/wrangler.json` (the artifact needs `nodejs_compat`), and serves `dist/client/_headers` and the cache headers like Cloudflare Assets do.
6. Outbound HTTPS from the deployed Worker to the real Supabase project; Supabase Auth cookies, login, the Studio flow, `getClaims()` against real GoTrue, media upload to Storage, comments with real data, newsletter and WhatsApp delivery. Only a local HTTP stand-in for PostgREST was used (home, article, entities, latest, feed and `/api/articles` rendered its rows, and 18 requests reached it).
7. The effect of an Enterprise network allow-list, and the Sites usage limits of the plan.
8. Behaviour of `vinext 1.0.0-beta.5` on routes the checks did not time (ISR expiry of the article, latest and category pages), and any upgrade to vinext 1.1.0.
