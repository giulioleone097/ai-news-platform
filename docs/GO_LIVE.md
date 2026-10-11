# Go live

What is left before AtlasNews is public, in order. Each step needs an account, a domain or a decision that only the owner has. The default deployment is ChatGPT Sites with no Supabase ([SITES.md](SITES.md)); the Supabase deployment is the alternative for leaving Sites ([Self-hosted instead](#self-hosted-instead)).

## 1. Decisions

- **Licence.** Pick an SPDX identifier and add a `LICENSE` file. The Claude plugin directory and `scripts/validate-plugin.mjs --release` both require it.
- **Domain.** One public HTTPS origin: the Site URL or a custom domain. It also serves the MCP server at `/mcp`, so it is permanent once a plugin is published: OpenAI ties a published plugin to its origin.
- **Editors.** The ChatGPT account emails for `ATLASNEWS_ADMIN_EMAILS` (and `ATLASNEWS_EDITOR_EMAILS`).
- **Developer name** shown in the plugin stores (the manifests say "AtlasNews").

## 2. Deploy on ChatGPT Sites

See [SITES.md](SITES.md#what-the-owner-does-in-chatgpt). Deploy `apps/web` with `@Sites`, commit the `project_id`, set the variables in the Site settings, redeploy. Then check:

- `GET /api/health` answers with `contentMode: "sites"`; `checks` lists anything still unconfigured.
- Sign in at `/en/login` with an admin account, write and publish a draft in the Studio, upload a cover.
- `/oauth/consent`, `/en/login` and the Studio carry `X-Frame-Options: DENY`.
- The build ran with pnpm. The Sites image ships pnpm 11.25.0 and the repository pins 12.11.2; if the build fails on the package manager, pin 11.25.0 in both `package.json` files.

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
