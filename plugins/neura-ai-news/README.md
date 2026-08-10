# NEURA AI News agent plugin

One portable plugin bundle for Codex/OpenAI agent plugins, Claude Code, and GitHub Copilot CLI. Version 2 exposes published news and approved comments through the public MCP server, plus authenticated editorial CRUD, comment moderation, newsletter campaigns, media, and queued social publishing through the admin server.

The public server is anonymous and read-only. Admin tools require `NEURA_MCP_ADMIN_API_KEY` in the client environment and the matching server-side value. Consequential tools require `confirm: true`; email and social delivery are queued, idempotent, and processed by protected workers rather than sent inline.

The bundled URLs target local development. After Vercel deployment, replace both `http://localhost:3000` URLs in `.mcp.json` with the production origin before distributing the plugin.

Never commit a real API key. Generate one with `openssl rand -hex 32` and store it in the deployment secret manager and client environment.
