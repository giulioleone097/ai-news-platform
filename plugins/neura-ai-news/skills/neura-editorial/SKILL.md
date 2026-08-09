---
name: neura-editorial
description: Read NEURA AI news or manage NEURA articles through the public and authenticated admin MCP servers.
---

# NEURA editorial workflow

Use `neura-public` for research and published content. It is anonymous and read-only.

Use `neura-admin` only when the user explicitly asks to create, update, publish, or delete newsroom content. The host must provide `NEURA_MCP_ADMIN_API_KEY`; never print or persist its value.

Before a write, fetch the target article and valid locale categories. Prefer draft creation. Treat publishing and deletion as consequential actions: summarize the intended mutation first and require an unambiguous user instruction. Deletion additionally requires `confirm: true`.

Keep English as the default locale. Never assume an English slug exists in Italian or vice versa.
