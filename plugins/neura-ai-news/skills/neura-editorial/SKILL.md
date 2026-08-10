---
name: neura-editorial
description: Read NEURA AI news and approved comments or manage articles, moderation, newsletter campaigns, media, and queued social publishing through MCP.
---

# NEURA editorial workflow

Use `neura-public` for research, published content, and approved comments. It is anonymous and read-only.

Use `neura-admin` only when the user explicitly asks to create, update, publish, moderate, queue, export, or delete newsroom data. It covers article CRUD, comment moderation and audit, newsletter consent and campaigns, immutable media, and social outbox lifecycle. The host must provide `NEURA_MCP_ADMIN_API_KEY`; never print or persist its value.

Before a write, fetch the target article and valid locale categories. Prefer draft creation. Treat publishing and deletion as consequential actions: summarize the intended mutation first and require an unambiguous user instruction. Deletion additionally requires `confirm: true`.

Keep English as the default locale. Never assume an English slug exists in Italian or vice versa.

Social preview never writes. Enqueue never sends inline. Correct a cancelled or duplicate-safe failed job only through `admin_social_requeue`, using the latest `revision` read-back and `confirm: true`. Processing the social outbox can publish externally and therefore requires an explicit user instruction plus `confirm: true`; never infer a WhatsApp recipient. Newsletter campaign delivery follows the same preview, queue, confirm, and read-back discipline. Newsletter and comment tools expose personal data: return only what the user asked for and never log email addresses, IP-derived identities, or moderation evidence. Media upload accepts base64 assets up to 160 KiB; use Studio for larger images. Never delete a media asset while an article references it.
