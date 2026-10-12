# Hosting apps/mcp and apps/jobs in containers

`apps/mcp` (MCP server, default port 8787) and `apps/jobs` (background workers, default port 8788) each run from the same [Dockerfile](../Dockerfile), selected by a build argument. Any container host that runs an OCI image works. These containers are for the self-hosted Supabase deployment ([DEPLOYMENT.md](DEPLOYMENT.md)). On ChatGPT Sites the Site's Worker serves the MCP server and runs the workers itself, so neither container is needed ([SITES.md](SITES.md#what-runs-on-the-site)). The reader site (`apps/web`) is not part of this image.

## Build

Run from the repository root (the build context):

```sh
docker build --build-arg APP=mcp  -t atlasnews-mcp  .
docker build --build-arg APP=jobs -t atlasnews-jobs .
```

The image is `node:24-slim` (the `engines.node` major). A build stage runs `pnpm deploy --prod` for the selected app from the root lockfile (pnpm comes from Corepack at the version pinned in `packageManager`; the pnpm store is a BuildKit cache). The runtime stage copies only that result: the app, the workspace packages it uses and its production dependencies, so `apps/web`, the root dev tooling and pnpm itself are not in the image. There is no compile step: the app runs its TypeScript source through `tsx` (a production dependency of both apps), as `pnpm --filter @atlasnews/<app> start` does. Runtime is non-root (`node`, uid 1000) with `NODE_ENV=production`. No environment file or secret is copied into the image.

## Run

```sh
docker run --rm -p 18787:8787 -e ATLASNEWS_CONTENT_MODE=demo atlasnews-mcp
docker run --rm -p 18788:8788 --env-file /path/outside/repo/jobs.env atlasnews-jobs
```

- `PORT` sets the listen port. Both apps default to 8787 and 8788. The server binds all interfaces, so publish the port with `-p`.
- The process runs under `tini` as PID 1, so `docker stop` sends SIGTERM and the process exits at once. The apps have no graceful drain: in-flight requests are cut.
- `apps/jobs` has no scheduler. Its schedule is the Supabase `pg_cron` job described in [DEPLOYMENT.md](DEPLOYMENT.md#schedule-the-workers). Point the Vault secret `jobs_base_url` at the public origin of this container.

## Environment variables

Names come from [.env.example](../.env.example), [DEPLOYMENT.md](DEPLOYMENT.md) and the readers in `packages/adapters/src/config/env.ts`. Secrets are read at run time only. Set every one through the host's secret store, never in the image or in git.

`apps/mcp`:

| Variable | Notes |
| --- | --- |
| `ATLASNEWS_CONTENT_MODE` | `demo` or `supabase`. Defaults to `supabase` when the two Supabase public variables are set, otherwise `demo`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required in `supabase` mode. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Enables editor sign-in and the admin tools. |
| `ATLASNEWS_MCP_ADMIN_API_KEY`, `ATLASNEWS_MCP_ADMIN_AUTHOR_ID` | Optional CI and CLI credential (32+ characters) and its author. |
| `ATLASNEWS_MCP_OAUTH_ISSUER`, `ATLASNEWS_MCP_OAUTH_AUDIENCE` | Optional overrides for sign-in. |
| `ATLASNEWS_OPENAI_APPS_CHALLENGE` | Optional OpenAI domain-verification token. `GET /.well-known/openai-apps-challenge` returns it as `text/plain` with `Cache-Control: no-store`; unset, blank or invalid answers `404`. One line of printable ASCII without spaces, 8 to 256 characters. |
| `ATLASNEWS_MCP_UI_DOMAIN` | Optional dedicated origin of the hosted UI, sent as `_meta.ui.domain`. OpenAI requires it for a plugin that ships UI, unique per plugin. Must be `https://` with no path, query, fragment or trailing path, for example `https://ui.news.example.com`; invalid values are ignored and the metadata stays unchanged. |
| `NEXT_PUBLIC_MCP_URL` | Public origin of this server, no path. Required for editor sign-in (without it only the API key works); set it to the exact origin hosts were given. |
| `ATLASNEWS_MCP_OAUTH_CLIENT_IDS` | Comma-separated OAuth client ids to accept; required for editor sign-in. Empty means no OAuth, and `/api/health` reports it as not ready (set it on the site too). |
| `ATLASNEWS_CLIENT_IP_HEADER` | Optional name of the one header your proxy overwrites with the client's IP address. It keys the per-network limits of comments and newsletter requests; empty means they never bind. See [DEPLOYMENT.md](DEPLOYMENT.md#client-address-and-rate-limits). |
| `ATLASNEWS_MCP_EVENTS_MAX_PER_PRINCIPAL`, `ATLASNEWS_MCP_EVENTS_MAX_PER_HOST`, `ATLASNEWS_MCP_EVENTS_MAX_PER_DOMAIN`, `ATLASNEWS_MCP_EVENTS_MAX_SUBSCRIPTIONS`, `ATLASNEWS_MCP_EVENTS_SUBSCRIBES_PER_MINUTE` | Optional MCP Events limits (20, 25, 100, 1000, 30). The rate counter is in memory, per container. |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin of the reader site. Used for revalidation. |
| `ATLASNEWS_REVALIDATE_SECRET` | Same value as on `apps/web` (32+ characters). |
| `MCP_ALLOWED_ORIGINS` | Optional comma-separated browser origins; any other `Origin` is answered 403. Empty allows the site's own origin, `https://chatgpt.com` and `https://claude.ai`. |
| `PORT` | Optional. Default 8787. |

`apps/jobs`:

| Variable | Notes |
| --- | --- |
| `CRON_SECRET` | Required. Each `/internal/*` route checks `Authorization: Bearer <CRON_SECRET>`. Unset answers `503`. Same value as the Vault secret `jobs_cron_secret`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Needed by the workers that write to Supabase. |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin of the reader site, used in newsletter and comment links. Must be HTTPS in production (`NODE_ENV=production` is set by the image). |
| `ATLASNEWS_COMMENT_GUEST_SECRET` | Comment notifications (32+ characters). |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NEWSLETTER_UNSUBSCRIBE_SECRET`, `NEWSLETTER_FROM_EMAIL`, `NEWSLETTER_REPLY_TO` | Newsletter and comment email delivery. `NEWSLETTER_REPLY_TO` is optional. |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN`, `LINKEDIN_API_VERSION` | LinkedIn publishing. Optional; without them that provider is not configured. |
| `X_USER_ACCESS_TOKEN` | X publishing. Optional. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_VERIFY_TOKEN` | WhatsApp publishing. Optional. |
| `PORT` | Optional. Default 8788. |

## Health and smoke checks

`apps/mcp`:

```sh
curl -fsS http://localhost:18787/info | grep '"name":"atlasnews"'      # 200, JSON
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:18787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'MCP-Method: tools/list' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'   # 200
```

The full `tools/list` body from that request lists every tool. The complete request, with its headers, is in [MCP.md](MCP.md).

`apps/jobs`:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:18788/internal/social-outbox   # 401 {"error":"unauthorized"}
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:18788/no-such-path            # 404 {"error":"not_found"}
```

The `401` on the unauthenticated request confirms the route is up. Authenticated calls run a worker batch against Supabase and the providers, so run them only when you intend that. Without `CRON_SECRET` the same request answers `503` (`cron_not_configured` on this route).

## Public origin of the MCP server

Once a plugin is published, the public origin of the MCP server must never change. OpenAI ties a plugin to that origin. For a self-hosted server, choose the host (for example `https://mcp.news.example.com`; on ChatGPT Sites the origin is the Site's own and the path is `/mcp`), set `NEXT_PUBLIC_MCP_URL` to it, and keep it for the life of the plugin. The bundled plugin URLs are local until replaced; see [AGENT_PLUGIN.md](AGENT_PLUGIN.md).
