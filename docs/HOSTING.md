# Hosting apps/mcp and apps/jobs in containers

`apps/mcp` (MCP server, default port 8787) and `apps/jobs` (background workers, default port 8788) each run from the same [Dockerfile](../Dockerfile), selected by a build argument. Any container host that runs an OCI image works. The reader site (`apps/web`) is not part of this image; it runs on ChatGPT Sites ([SITES.md](SITES.md)).

## Build

Run from the repository root (the build context):

```sh
docker build --build-arg APP=mcp  -t atlasnews-mcp  .
docker build --build-arg APP=jobs -t atlasnews-jobs .
```

The image is `node:24-slim` (the `engines.node` major). It installs with `npm ci --workspace apps/<app>` from the root lockfile, so `apps/web` and root dev tooling are not installed. There is no compile step: the app runs its TypeScript source through `tsx`, as `npm run start -w apps/<app>` does. Runtime is non-root (`node`, uid 1000) with `NODE_ENV=production`. No environment file or secret is copied into the image.

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
| `NEXT_PUBLIC_MCP_URL` | Public origin of this server, no path. Set it on any host behind a proxy or CDN; otherwise the request origin is used. |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin of the reader site. Used for revalidation. |
| `ATLASNEWS_REVALIDATE_SECRET` | Same value as on `apps/web` (32+ characters). |
| `MCP_ALLOWED_ORIGINS` | Optional comma-separated browser origins. Empty means wildcard CORS for the public endpoint. |
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

The full `tools/list` body from that request lists 50 tools. The complete request, with its headers, is in [MCP.md](MCP.md).

`apps/jobs`:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:18788/internal/social-outbox   # 401 {"error":"unauthorized"}
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:18788/no-such-path            # 404 {"error":"not_found"}
```

The `401` on the unauthenticated request confirms the route is up. Authenticated calls run a worker batch against Supabase and the providers, so run them only when you intend that. Without `CRON_SECRET` the same request answers `503` (`cron_not_configured` on this route).

## Public origin of the MCP server

Once a plugin is published, the public origin of the MCP server must never change. OpenAI ties a plugin to that origin. Choose the host (for example `https://mcp.news.example.com`), set `NEXT_PUBLIC_MCP_URL` to it, and keep it for the life of the plugin. The bundled plugin URLs are local until replaced; see [AGENT_PLUGIN.md](AGENT_PLUGIN.md).
