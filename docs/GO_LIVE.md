# Go live

What is left before AtlasNews is public, in order. Everything here needs an account, a domain or a decision that only the owner has. The code side is done and passes `pnpm check`; each step links to the document that has the commands.

## 1. Decisions

- **Licence.** Pick an SPDX identifier and add a `LICENSE` file. The Claude plugin directory and `scripts/validate-plugin.mjs --release` both require it.
- **Domains.** Three public HTTPS origins: the reader site, the MCP server and the workers. The MCP origin is permanent: OpenAI ties a published plugin to it, and a new origin is a new plugin.
- **Developer name** shown in the plugin stores (the manifests say "AtlasNews").

## 2. Supabase project

See [DEPLOYMENT.md](DEPLOYMENT.md).

1. Apply the migrations (`pnpm exec supabase db push`, dry run first). Enable `pg_cron` and `pg_net` in the dashboard if the push asks for them.
2. Switch the project to asymmetric JWT signing keys. With HS256 the JWKS is empty and no editor token verifies.
3. Enable the OAuth server with authorization path `/oauth/consent` and the site URL. Register ChatGPT and Claude as clients, turn dynamic registration off, and put their client ids in `ATLASNEWS_MCP_OAUTH_CLIENT_IDS`.
4. Bootstrap the first editor ("Bootstrap the first editor" in DEPLOYMENT.md).
5. Set the Vault secrets `jobs_base_url` and `jobs_cron_secret` ("Schedule the workers").
6. Run this as `postgres` and confirm that the functions `anon` and `authenticated` can execute are only the ones re-granted in `supabase/migrations/20261014090000_restrict_function_execute.sql`. The local stack cannot show a hosted project's default privileges.

   ```sql
   select p.oid::regprocedure,
          has_function_privilege('anon', p.oid, 'execute') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef;
   ```

## 3. MCP server and workers

See [HOSTING.md](HOSTING.md). Build the image twice (`--build-arg APP=mcp`, `--build-arg APP=jobs`), deploy each to a container host, and set the variables listed there. `NEXT_PUBLIC_MCP_URL` is required for editor sign-in. Set `ATLASNEWS_CLIENT_IP_HEADER` to the one header your proxy sets.

## 4. Reader site on ChatGPT Sites

See [SITES.md](SITES.md). In the ChatGPT desktop app, create a Site from `apps/web` and deploy it; set the variables in the Site settings; connect the custom domain. Then check:

- `GET /api/health` answers 200 with `contentMode: "supabase"`.
- `/oauth/consent` and `/en/login` carry `X-Frame-Options: DENY`.
- The build ran with pnpm. The Sites image ships pnpm 11.25.0 and the repository pins 12.11.2; if the build fails on the package manager, pin 11.25.0 in both `package.json` files.

## 5. Connect the hosts

See [MCP.md](MCP.md), [OPENAI_EXTENSIONS.md](OPENAI_EXTENSIONS.md) and [SITE_TOOLS.md](SITE_TOOLS.md).

- ChatGPT developer mode: add `https://<mcp>/mcp`, confirm the tools and the `article.published` event, sign in as an editor, publish a draft.
- Claude: add the connector, confirm that an editor tool starts the sign-in.
- ChatGPT's built-in browser: open the site and the Studio and confirm the site tools are listed; publish from the Studio tools and confirm the dialog asks you.

## 6. Plugin submission

See [AGENT_PLUGIN.md](AGENT_PLUGIN.md).

1. Publish privacy, terms and support pages and record the demo video.
2. Fill the placeholders in `plugins/atlasnews` until `node scripts/validate-plugin.mjs --release` passes.
3. Set `ATLASNEWS_OPENAI_APPS_CHALLENGE` with the token from the OpenAI portal and `ATLASNEWS_MCP_UI_DOMAIN` with a dedicated origin.
4. Submit to OpenAI (verified publisher, global data residency, an editor test account without MFA) and to the Claude directory (public repository).

## 7. Repository

The GitHub Actions workflow `CI` is disabled on GitHub. Re-enable it so pull requests run `pnpm check`.

## Not verified without these steps

- The Sites artifact on a real Site, including whether platform headers and limits match local `workerd`.
- A real ChatGPT or Claude connection: discovery order, redirect URI, scope handling, account linking, the WebMCP host.
- A hosted Supabase project: default privileges, the OAuth server behind a public origin, token revocation timing.
- Provider sends (Resend, LinkedIn, X, WhatsApp) with real credentials.
