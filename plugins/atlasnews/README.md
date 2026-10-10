# AtlasNews plugin

One portable folder for ChatGPT and Codex (OpenAI Agent Plugins), Claude (Claude Code, claude.ai, Cowork) and GitHub Copilot CLI. It connects an assistant to AtlasNews, an English and Italian publication on AI, through a single MCP server at `POST /mcp`.

## What it does

Anyone can list and search published stories, open one with its key points, sources and claim status, browse categories, read approved comments, build a briefing by topic and open the AtlasNews newsroom beside the chat. Reading needs no account.

Editors sign in with their AtlasNews account to manage articles, moderate comments, run newsletter campaigns, upload media and queue social posts. Tools that publish, delete, email or post ask for confirmation, and email and social delivery are queued and sent by background workers, never inline.

## Install

Add this repository as a marketplace, then install `atlasnews` from it.

```sh
claude plugin marketplace add <owner>/<repository>
claude plugin install atlasnews@atlasnews-plugins
codex plugin marketplace add <owner>/<repository>
```

Copilot CLI reads `.github/plugin/marketplace.json` from the same repository.

## Connect and sign in

The server URL is in two files that must stay identical: `mcp.json` (OpenAI and Copilot) and `.mcp.json` (Claude). Both ship with the local development address `http://localhost:8787/mcp` (`pnpm --filter @atlasnews/mcp start`). Before you publish, replace it with the public HTTPS address of the deployed server, as described in `docs/AGENT_PLUGIN.md`.

Reading is anonymous. When an editor tool is first used the host starts OAuth 2.1 sign-in against Supabase Auth with dynamic client registration; no key or token is ever stored in this plugin.

## Skills

- `onboarding`: confirms the connection, learns language and topics, and builds a first briefing.
- `newsroom`: reading rules and the editor workflow with its confirmation discipline.

## Checks

`pnpm plugin:check` validates the structure and limits of every manifest. `pnpm plugin:release` additionally lists what must be supplied before submission to the OpenAI and Claude directories.
