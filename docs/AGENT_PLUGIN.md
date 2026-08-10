# Agent plugin

NEURA ships one repository-local plugin at `plugins/neura-ai-news` for Codex/OpenAI agent plugins, Claude Code, and GitHub Copilot CLI.

## Connections

- `neura-public`: anonymous read-only articles, categories and approved comments at `/api/mcp`
- `neura-admin`: authenticated editorial, moderation, campaign, media and social-publishing MCP at `/api/mcp/admin`

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

The portable skill keeps consequential actions explicit: article deletion, moderation, subscriber erasure, campaign queueing and social delivery require a direct user request. Queueing is not evidence of delivery; use the outbox/read-back tools for the persisted Resend, LinkedIn, X or WhatsApp receipt. The cross-client bundle is versioned `2.0.0` and validated in CI.
