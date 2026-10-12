# Go live

What is left before AtlasNews is public, in order. Each step needs an account, a domain or a decision that only the owner has. The default deployment is ChatGPT Sites with no Supabase ([SITES.md](SITES.md)); the Supabase deployment is the alternative for leaving Sites ([Self-hosted instead](#self-hosted-instead)).

## 1. Decisions

- **Licence.** Pick an SPDX identifier and add a `LICENSE` file. The Claude plugin directory and `scripts/validate-plugin.mjs --release` both require it.
- **Domain.** One public HTTPS origin: the Site URL or a custom domain. It also serves the MCP server at `/mcp`, so it is permanent once a plugin is published: OpenAI ties a published plugin to its origin.
- **Editors.** The ChatGPT account emails for `ATLASNEWS_ADMIN_EMAILS` (and `ATLASNEWS_EDITOR_EMAILS`).
- **Developer name** shown in the plugin stores (the manifests say "AtlasNews").

## 2. Deploy on ChatGPT Sites

See [SITES.md](SITES.md#what-the-owner-does-in-chatgpt). Deploy `apps/web` with `@Sites`, commit the `project_id`, set the variables in the Site settings, redeploy. Then check:

- `GET /api/health` answers with `contentMode: "sites"`; `checks` lists anything still unconfigured (status 503) and `warnings` lists what weakens a limit without blocking (status stays 200), such as `client-address-header`: set `ATLASNEWS_CLIENT_IP_HEADER=cf-connecting-ip`.
- Sign in at `/en/login` with an admin account, write and publish a draft in the Studio, upload a cover.
- `/oauth/consent`, `/en/login` and the Studio carry `X-Frame-Options: DENY`.
- The build ran with pnpm. The Sites image ships pnpm 11.25.0 and the repository pins 12.11.2; if the build fails on the package manager, pin 11.25.0 in both `package.json` files.

### Before the site is public: the identity probe

The Studio, `/api/capabilities/*` and the admin tools on `/mcp` trust the `oai-authenticated-*` headers that ChatGPT Sites adds, which is safe only if the platform replaces any copy a client sends. That is not verified ([SITES.md](SITES.md#not-verified-without-a-real-deployment)). Before the audience is public, send forged headers to the live Site. All three requests are read-only. `<admin email>` is an address in `ATLASNEWS_ADMIN_EMAILS`, because that is the identity an attacker would forge.

```sh
SITE=https://<site>

# 1. Nobody is signed in: expect "user":null
curl -sS "$SITE/api/auth/session" \
  -H 'oai-authenticated-user-id: probe' -H 'oai-authenticated-user-email: x@example.com'

# 2. The Studio sends the visitor to the login: expect 307 and a Location ending in /en/login
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "$SITE/en/studio" \
  -H 'oai-authenticated-user-id: probe' -H 'oai-authenticated-user-email: <admin email>'

# 3. An admin tool is refused: expect 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$SITE/mcp" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -H 'oai-authenticated-user-id: probe' -H 'oai-authenticated-user-email: <admin email>' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"admin_list_articles","arguments":{"locale":"en"}}}'
```

Count an answer only if the app gave it: the JSON of step 1, the 307 of step 2, the JSON-RPC error of step 3. A login wall of the platform in front of a private Site proves nothing. If any answer differs, the platform did not strip the headers: set `ATLASNEWS_CHATGPT_SIGN_IN=off`, redeploy, repeat the probe, and let editors sign in with Google or GitHub until the platform is confirmed to replace the headers.

## 3. Connect the hosts

See [MCP.md](MCP.md), [OPENAI_EXTENSIONS.md](OPENAI_EXTENSIONS.md) and [SITE_TOOLS.md](SITE_TOOLS.md).

- ChatGPT: ask `@Sites` for the Site's MCP connection and to suggest the plugin; confirm the tools and the `article.published` event; run an editor tool.
- Claude: add a custom connector at `https://<site>/mcp`; confirm the read tools; try an editor tool.
- ChatGPT's built-in browser: open the site and the Studio and confirm the site tools are listed; publish from the Studio tools and confirm the dialog asks you.

## 4. Plugin submission

See [AGENT_PLUGIN.md](AGENT_PLUGIN.md).

1. Publish privacy, terms and support pages and record the demo video.
2. Fill the placeholders in `plugins/atlasnews` until `node scripts/validate-plugin.mjs --release` passes.
3. Set `ATLASNEWS_OPENAI_APPS_CHALLENGE` with the token from the OpenAI portal and `ATLASNEWS_MCP_UI_DOMAIN` with a dedicated origin.
4. Submit to OpenAI (verified publisher, global data residency, an editor test account without MFA) and to the Claude directory (public repository).

## 5. Repository

The GitHub Actions workflow `CI` is disabled on GitHub. Re-enable it so pull requests run `pnpm check`.

## Self-hosted instead

To leave Sites, set `ATLASNEWS_CONTENT_MODE=supabase` and follow [DEPLOYMENT.md](DEPLOYMENT.md) (Supabase project: migrations, asymmetric JWT keys, OAuth server, first editor, Vault secrets for `pg_cron`) and [HOSTING.md](HOSTING.md) (the `apps/mcp` and `apps/jobs` images; then three origins: site, MCP, workers). Content does not move between D1 and Supabase by itself.

## Not verified without these steps

- The artifact on a real Site: D1/R2 provisioning, migrations, identity headers, platform limits.
- A real ChatGPT or Claude connection to the Site's `/mcp`.
- Provider sends (Resend, LinkedIn, X, WhatsApp) with real credentials.
