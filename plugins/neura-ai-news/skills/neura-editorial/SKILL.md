---
name: neura-editorial
description: Read NEURA AI news or manage articles, distribution, newsletter consent and media through the public and authenticated admin MCP servers.
---

# NEURA editorial workflow

Use `neura-public` for research and published content. It is anonymous and read-only.

Use `neura-admin` only when the user explicitly asks to create, update, publish, export or delete newsroom content. It covers article CRUD, distribution workflow, newsletter consent state and immutable media. The host must provide `NEURA_MCP_ADMIN_API_KEY`; never print or persist its value.

Before a write, fetch the target article and valid locale categories. Prefer draft creation. Treat publishing and deletion as consequential actions: summarize the intended mutation first and require an unambiguous user instruction. Deletion additionally requires `confirm: true`.

Keep English as the default locale. Never assume an English slug exists in Italian or vice versa.

Distribution tools record workflow state but do not claim to post externally. Newsletter tools expose personal data: return only what the user asked for and never log email addresses. Media upload accepts base64 assets up to 160 KiB; use Studio for larger images. Never delete a media asset while an article references it.
