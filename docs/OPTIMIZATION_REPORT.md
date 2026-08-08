# Independent optimization report

This report records the post-development optimization pass completed on 2026-08-08. Each lane had one bounded objective, an independent acceptance condition, and a targeted proof. The final release gate covers their integrated behavior.

| Cycle | Lane | Objective | Result and decisive proof |
| --- | --- | --- | --- |
| 1 | Public performance | Remove avoidable public request and font overhead | Supabase session refresh now runs only on Studio/Auth routes. Local fonts use Latin subsets and WOFF2 where available. Production build generated 52 routes; warm local HTML requests averaged under 4 ms during the smoke pass. |
| 2 | Accessibility | Make navigation, forms, and feedback operable on mobile and assistive technology | Closed mobile navigation is removed from the accessibility tree, interactive targets are at least 44 px, form errors are associated with fields, and newsletter status is announced. ESLint and browser DOM checks passed. |
| 3 | Authorization and abuse resistance | Fail closed and bound public inputs | Production Studio redirects to sign-in without Supabase, demo Studio requires explicit production opt-in, MCP bodies are capped while streaming, and admin-only profile reads are separated in RLS. Security regression tests passed. |
| 4 | SEO, localization, and social metadata | Preserve English-first parity and correct index signals | Article Open Graph metadata includes canonical URL and locale alternates, search is `noindex,follow`, sitemap entries include `x-default`, and robots rules exclude localized auth/studio paths. EN and IT catalog parity tests passed. |
| 5 | Hexagonal architecture | Recheck dependency direction and eliminate duplicated cursor logic | Domain/application boundaries remain independent of Next.js and Supabase. Web and MCP now share one cursor codec while delivery-specific validation stays at each inbound adapter. TypeScript and boundary inspection passed. |
| 6 | Deployment operations | Prove reproducibility for GitHub, Vercel, and Supabase | Node 24, `npm ci`, GitHub Actions, `vercel.json`, `.env.example`, `supabase/config.toml`, migration, seed, deployment runbook, and rollback instructions are committed and mutually consistent. Clean install dry-run and production build passed. |
| 7 | Responsive visual quality | Check the implemented design at desktop and mobile sizes | English desktop and Italian mobile routes were inspected in the real browser. Both had zero horizontal overflow; mobile navigation and 44 px language targets were verified. |
| 8 | Data and cache correctness | Eliminate pagination collisions and subscription disclosure | Supabase pagination now uses `(published_at, id)` ordering and filtering. Newsletter writes use a validated security-definer RPC with a uniform response and no anonymous table-insert policy. PostgreSQL 17 migration/seed assertions passed. |
| 9 | Reliability | Provide bounded recovery instead of blank failures | Localized public and Studio error boundaries now preserve language, navigation, retry behavior, and useful copy. TypeScript, lint, and tests passed. |
| 10 | Red-team release review | Detect leaked secrets, vulnerable runtime packages, and unsafe dynamic code | Gitleaks scanned repository history with the documented UUID-placeholder allowlist and found no leaks. `npm audit --omit=dev` reported zero vulnerabilities. No `eval`, `new Function`, or unresolved placeholder markers were found in application code. |
| 11 | Feed UX and perceived speed | Make infinite scrolling the default without sacrificing first paint | Latest, category, and search render six rows server-side, prefetch at an 800 px root margin, fetch compact row projections, deduplicate IDs, expose retry/end states, and retain a load-more fallback. Browser proof loaded 6 → 7 unique rows automatically in EN and IT with zero overflow. |

## Integrated release evidence

- `npm run check`: design.md 0.4 validation, generated-token drift check, ESLint, TypeScript, 39 Vitest tests, and Next.js 16.3 production build.
- Fresh PostgreSQL 17: migration and seed applied; 8 EN + 8 IT articles, 5 EN + 5 IT categories, localized full-text search, RLS helper attributes, newsletter RPC, and policies read back successfully.
- Production HTTP: `/` redirects to `/en`; localized home/article/search/RSS, sitemap, MCP discovery, and MCP initialize respond successfully; Studio fails closed without production credentials.
- Infinite feed API: six first items, opaque next cursor, one final item, no duplicate IDs, invalid cursor `400`, public cache headers present.
- Browser: real automatic scroll, seven unique rows, localized terminal state, and no horizontal overflow at 1280 px or 390 px.

Performance budgets and the repeatable release procedure remain canonical in [OPERATIONS.md](OPERATIONS.md).
