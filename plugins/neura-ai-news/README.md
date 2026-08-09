# NEURA AI News agent plugin

One portable plugin bundle for Codex/OpenAI agent plugins, Claude Code, and GitHub Copilot CLI.

The public server works without credentials. Admin tools require `NEURA_MCP_ADMIN_API_KEY` in the client environment and the matching server-side value.

The bundled URLs target local development. After Vercel deployment, replace both `http://localhost:3000` URLs in `.mcp.json` with the production origin before distributing the plugin.

Never commit a real API key. Generate one with `openssl rand -hex 32` and store it in the deployment secret manager and client environment.
