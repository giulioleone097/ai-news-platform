---
name: onboarding
description: Set up NEURA AI News after installation or when the user asks for onboarding - confirm the connection, learn their language and topics, and show the newsroom, briefing and alerts.
---

# Set up NEURA AI News

Call `list_categories` with `{}` to confirm the public NEURA server answers. If it fails, say NEURA is unreachable right now and stop; do not invent articles.

Ask these questions one at a time, using anything the user already said:

1. "Do you want NEURA in English or Italian?" Use `en` or `it` as `locale` from now on.
2. "Which topics matter most to you?" Offer the category names returned by `list_categories` for that locale.

Then call `build_briefing` with the chosen `locale` and the matching category slugs as `topics`. When the user prefers to pick in a form, call it without `topics`; ChatGPT shows a native form where supported and the tool falls back to every topic elsewhere.

Close with a short tour, mentioning only what applies to the current host:

- The **NEURA** sidebar app and the **AI news beside chat** panel open the newsroom without a prompt.
- On ChatGPT desktop, typing `@` in the composer finds NEURA articles to mention.
- In Work chats, the user can ask to be notified when NEURA publishes a new article, optionally filtered by language or category.

These preferences live in this conversation only; NEURA does not store personal settings. If the plugin was installed during another task, return to that task afterwards.

Editors who also want newsroom tools need `NEURA_MCP_ADMIN_API_KEY` set in their client environment by an administrator. Never ask anyone to paste a key into the chat.
