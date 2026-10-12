# Agent plugin

AtlasNews ships one plugin, `plugins/atlasnews`, for ChatGPT and Codex (OpenAI Agent Plugins), Claude (Claude Code, claude.ai, Cowork) and GitHub Copilot CLI. It declares exactly one MCP server, the `POST /mcp` endpoint ([MCP.md](MCP.md)), which is `apps/mcp` served at `/mcp` of the Site's Worker on ChatGPT Sites, or the standalone `apps/mcp` self-hosted: anonymous callers read, signed-in editors also get the newsroom tools.

## Files

| File | Read by | Purpose |
| --- | --- | --- |
| `plugin.json` | OpenAI, Copilot CLI | Portable manifest (Agent Plugins schema): identity, `extensions.com.openai` with the listing (`interface`), the onboarding skill, the review test cases and the publication notes |
| `mcp.json` | OpenAI, Copilot CLI | The one server (`type: streamable-http`) and its auth declaration: `mixed` (anonymous plus OAuth), dynamic client registration, default scope `email` |
| `.claude-plugin/plugin.json` | Claude | Claude manifest, including the directory listing fields (icon, documentation, support, privacy, terms) |
| `.mcp.json` | Claude | The same server with `type: http`; Claude finds the sign-in through the server's resource metadata |
| `skills/onboarding/SKILL.md`, `skills/newsroom/SKILL.md` | all | First-run setup, and the reading and editor workflow |
| `assets/icon*.svg`, `assets/logo*.svg` | OpenAI, Claude | Composer icon and logo, light and dark, in the brand colours of `DESIGN.md` |
| `README.md` | Claude directory | What it does, install, connect, sign in (the directory requires at least 40 words) |
| `../../.agents/plugins/marketplace.json`, `../../.claude-plugin/marketplace.json`, `../../.github/plugin/marketplace.json` | Codex, Claude, Copilot CLI | The three marketplace files at the repository root, each listing `atlasnews` at `./plugins/atlasnews` |

There is no `.codex-plugin/plugin.json`: OpenAI documents it only as a fallback for packages without the inline `extensions.com.openai` object. There are no hooks, apps, commands or agents, which public submission rejects.

## Install from this repository

```sh
claude plugin marketplace add <owner>/<repository>
claude plugin install atlasnews@atlasnews-plugins
codex plugin marketplace add <owner>/<repository>
```

Copilot CLI reads `.github/plugin/marketplace.json`. The plugin ships with the local server address `http://localhost:8787/mcp` (`pnpm --filter @atlasnews/mcp start`), so it works against a development checkout.

## Auth

The plugin holds no key and no token. Reading is anonymous. On ChatGPT Sites the platform signs the editor in for the Site's `/mcp` ([MCP.md](MCP.md#sign-in-on-chatgpt-sites)). Self-hosted, when an editor tool is called the server answers 401 with a Bearer challenge; the host registers itself with Supabase Auth, opens the consent page of the reader site and sends the resulting access token. The scopes `newsroom.*` are decided on the server from the editor's profile, and Supabase can grant only `email`, which is what the declaration lists. `ATLASNEWS_MCP_ADMIN_API_KEY` is a CI and CLI credential for the server and is not part of the plugin.

## Validate

```sh
pnpm plugin:check     # structure, limits, one server, consistency across manifests (runs in pnpm check)
pnpm plugin:release   # the same, plus what the stores need from the owner
```

`scripts/validate-plugin.mjs` is the only owner of the rules. It checks, among others: names and field limits of the OpenAI manifest (display name and short description at most 30 characters, five positive and three negative review cases whose tools exist in the catalogue, at most three default prompts), brand colours that exist in `DESIGN.md` with the required contrast, square icons of at least 48 px, one server with identical URLs in `mcp.json` and `.mcp.json`, an auth declaration that matches Supabase's dynamic registration setting, no API-key wording, tool names in the skills that exist, a README of at least 40 words, and the marketplace sources (`./plugins/atlasnews`, resolved from the repository root). `claude plugin validate plugins/atlasnews --strict` and `claude plugin validate .` pass as well.

## Before submission

Release mode fails until the owner supplies, in `plugin.json`, `.claude-plugin/plugin.json`, `mcp.json` and `.mcp.json`:

- the public HTTPS origin of the deployed MCP server (it must never change after publication), in both MCP files;
- the website, support, privacy policy and terms of service URLs (`interface.websiteURL`, `supportURL`, `privacyPolicyURL`, `termsOfServiceURL`, with `homepage` and the Claude `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl` set to the same pages) and the documentation URL (`documentationUrl`);
- a licence (`license`, an SPDX identifier);
- the review demo recording (`review.demo_recording_url`).

The site serves the three pages itself, in both languages, and links them from every page footer: use `https://<site>/en/support`, `https://<site>/en/privacy` and `https://<site>/en/terms` (the Italian ones are `/it/...`) for `supportURL`, `privacyPolicyURL` and `termsOfServiceURL`. The manifests carry these paths already, on the placeholder host that the owner replaces with the real origin. The licence is the owner's to choose; the repository does not contain it. Outside the package, the stores also need an OpenAI developer account with a verified publisher and global data residency, the domain-verification token, which `apps/mcp` serves at `/.well-known/openai-apps-challenge` once `ATLASNEWS_OPENAI_APPS_CHALLENGE` is set, `_meta.ui.domain` on the newsroom UI resource, a reviewer account with an editor profile entered in the portal (never in the package), and a Claude developer-portal submission from a public GitHub repository. See [OPENAI_EXTENSIONS.md](OPENAI_EXTENSIONS.md).

### Support, privacy and terms pages

`/{locale}/support` (what AtlasNews is, reporting a comment, unsubscribing, editor sign-in, a contact form), `/{locale}/privacy` and `/{locale}/terms` are in `apps/web/src/app/[locale]/(site)/`, with their text in `components/site/support/support-copy.ts`. The contact form posts to `POST /api/contact` (same origin, bounded JSON, honeypot, per-network and site-wide limits) and the messages appear in the Studio inbox and in the `admin_*_contact_message*` tools ([MCP.md](MCP.md#contact-inbox)). Nothing emails the owner when a message arrives: read the inbox, or have an assistant list it.

The privacy policy and the terms are **templates that describe what this app really processes** (comments with an optional email and the guest cookie, the double opt-in newsletter through Resend, contact messages, sign-in with ChatGPT or the self-hosted account, server logs, rate-limit counters; no ads, analytics or trackers). They are not legal advice. Before the plugin is submitted the owner must have them reviewed legally, name the controller (the legal name and a postal or email contact; the pages say only "AtlasNews, the publisher" and point to the contact form), check the retention, legal-basis and governing-law wording against the owner's jurisdiction, and change the text again whenever a feature that handles personal data is added.

Consequential tools stay explicit: publishing, deletion, moderation, subscriber erasure, campaign queueing and social delivery ask for confirmation, and queueing is not evidence of delivery; the skill tells the assistant to read the outbox back before saying anything was sent.
