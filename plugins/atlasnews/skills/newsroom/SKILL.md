---
name: newsroom
description: Read published AtlasNews stories and approved comments, and, for signed-in editors, manage articles, moderation, newsletter campaigns, media and queued social publishing.
---

# AtlasNews newsroom

## Reading (anyone, no sign-in)

Use `search_articles`, `list_articles`, `get_article`, `list_categories`, `list_comments` and `build_briefing` for research, published content and approved comments. Prefer `build_briefing` for topic digests. `list_articles`, `search_articles` and `get_article` also render the AtlasNews newsroom view in hosts that support MCP Apps, so keep text replies short when the view is shown.

Every story has a claim status: confirmed, rolling out, in test, rumour or analysis. Say it whenever you report a claim, and cite the story's sources. Keep English as the default locale. Never assume an English slug exists in Italian or vice versa.

## Newsroom tools (editors only)

The tools whose names start with `admin_` need an AtlasNews editor account. Use them only when the user explicitly asks to create, update, publish, moderate, queue, export or delete newsroom data. The host asks the user to sign in the first time one of them is called; if the sign-in does not complete, or the account is not an editor, say so and stop. Never ask for, print or store a password, token or key.

The tools are grouped by what they need:

- Read: `admin_list_articles`, `admin_get_article`, `admin_list_categories`, `admin_list_distribution`, `admin_list_media`, `admin_list_comments`, `admin_list_comment_reports`, `admin_list_comment_audit`, `admin_list_newsletter_subscriptions`, `admin_newsletter_list_campaigns`, `admin_newsletter_get_campaign`, `admin_newsletter_list_recipients`, `admin_social_preview`, `admin_social_list`, `admin_social_get`.
- Write: create and update articles and distribution, upload media, moderate comments, save and cancel newsletter campaign drafts, queue, requeue, cancel and retry social jobs.
- Publish: publish and delete articles and media, send or schedule campaigns, manage subscriber requests and erasure, and process the comment, newsletter and social outboxes.

Before a write, fetch the target article and the valid categories for its locale. Prefer creating a draft. Treat publishing and deletion as consequential: summarize the intended change first and require an unambiguous user instruction. Tools that publish, delete, email or post ask for confirmation through a form where the host supports it; elsewhere they need `confirm: true`, which you pass only after the user has said yes to that exact action.

Social preview never writes. Queueing never sends inline: a queued post or email is not a delivered one, so read the job back before saying it was sent. Correct a cancelled or duplicate-safe failed job only through `admin_social_requeue`, using the latest `revision` from the read-back. Processing an outbox can publish externally, so it needs an explicit user instruction; never infer a WhatsApp recipient.

Newsletter and comment tools expose personal data: return only what the user asked for and never log email addresses, IP-derived identities or moderation evidence. Media upload accepts base64 assets up to 160 KiB; use the Studio for larger images. Never delete a media asset while an article references it.
