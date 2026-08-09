# Agent plugin

NEURA ships one repository-local plugin at `plugins/neura-ai-news` for Codex/OpenAI agent plugins, Claude Code, and GitHub Copilot CLI.

## Connections

- `neura-public`: anonymous read-only MCP at `/api/mcp`
- `neura-admin`: authenticated article/distribution/newsletter/media MCP at `/api/mcp/admin`

The admin connection reads `NEURA_MCP_ADMIN_API_KEY` from the client environment. The same value must be configured server-side. Keep `SUPABASE_SERVICE_ROLE_KEY` and `NEURA_MCP_ADMIN_AUTHOR_ID` server-only.

Generate a key:

```bash
openssl rand -hex 32
```

For local use, keep the bundled localhost URLs. For Vercel, replace the origin in `plugins/neura-ai-news/.mcp.json` with the production URL before distributing the plugin.

## Validation

```bash
npm run plugin:check
```

The repository includes marketplace catalogs for all three hosts. Follow the host's plugin marketplace command to add this repository, then install `neura-ai-news`.

The portable skill keeps consequential actions explicit: article publish/delete, subscriber state changes, distribution status, and media deletion require a direct user request. Distribution state is an outbox record, not evidence that an external social network or email provider accepted a post.
