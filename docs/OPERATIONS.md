# Operations

## Release gate

Every release candidate must satisfy:

```bash
npm ci
npm run check
```

Additionally verify the local Supabase migration chain when schema or persistence behavior changes:

```bash
npx supabase start
npx supabase db reset --local
```

The CI build intentionally runs without Supabase credentials, proving the zero-config demo remains viable. A green CI build does not replace Preview smoke checks against Supabase.

## Performance budgets

Measure mobile at the 75th percentile and server endpoints at p95. These are release budgets, not aspirations.

| Signal | Budget |
| --- | --- |
| LCP | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.10 |
| Initial public-route client JavaScript | ≤ 100 KB compressed |
| Initial studio client JavaScript | ≤ 180 KB compressed |
| Route CSS | ≤ 35 KB compressed |
| Optimized above-the-fold hero transfer | ≤ 250 KB at a representative mobile viewport |
| Same-region cached HTML TTFB p75 | ≤ 400 ms |
| Public uncached HTML TTFB p75 | ≤ 800 ms |
| MCP list/search p95, application and database in aligned regions | ≤ 750 ms |
| MCP error rate | < 1% excluding invalid client input |

Measure a cold navigation and a warm navigation for `/en`, `/it`, one category, search, and an article. Reject regressions that exceed a budget or add a new request waterfall.

## Performance controls

- Public UI is Server Component first; client components are limited to interaction.
- Home feeds revalidate after 60 seconds; article records after 300 seconds.
- Publication actions revalidate affected localized paths instead of waiting for TTL.
- Images use `next/image`, responsive `sizes`, AVIF/WebP, dimensions, and long optimized-image cache TTL.
- Fonts are bundled locally; production rendering does not wait on a third-party font origin.
- Supabase and Vercel functions should share the nearest practical region.
- MCP is stateless and has a 10-second hard function ceiling.
- Search and feed queries use locale/status/category indexes and cursor pagination.

Never mark a regression acceptable because the second navigation is fast; cold-path behavior is part of the release gate.

## Observability without required third parties

Use Vercel deployment logs and function logs for application failures, Supabase database/Auth logs for persistence and RLS failures, and browser Performance/Core Web Vitals for user experience. External analytics, error tracking, and social automation are optional integrations, not runtime requirements.

Do not log:

- Auth tokens, cookies, or request authorization headers;
- newsletter email addresses;
- upstream response bodies containing private data;
- Supabase keys beyond confirming whether configuration is present.

Useful operational dimensions are route, locale, deployment ID, repository mode (`demo`/`supabase`), operation name, status, and bounded duration.

## Content operations

### Publishing

- Draft, review, scheduled, and published are distinct states.
- A published article requires `published_at`; scheduled content requires `scheduled_for`.
- Publish translations independently after editorial review.
- Verify the anonymous page and MCP tool output after publication.

### Social distribution

- Article pages create encoded LinkedIn, X, and WhatsApp share intents without private credentials.
- Optional `NEXT_PUBLIC_LINKEDIN_URL` and `NEXT_PUBLIC_X_URL` values expose validated official profile links; invalid or empty values are omitted.
- `/en/feed.xml` and `/it/feed.xml` provide cached RSS 2.0 distribution with locale-isolated published content.
- `social_publications` records channel state for newsletter, LinkedIn, X, and WhatsApp.
- Recording `ready` is not proof of external publication. Store the external URL and publication timestamp only after an authorized outbound integration confirms success.
- Never retry non-idempotent outbound posts blindly.

### Newsletter

- Subscriptions are normalized to lower-case and unique.
- Anonymous access can insert active subscriptions but cannot read the audience.
- Editor access to subscription data is protected by RLS.
- A production mailing provider is optional; the platform remains functional as a consented subscriber registry without one.

## Incident triage

1. Identify the affected deployment, locale, route/tool, and first observed time.
2. Determine whether the app is in demo or Supabase mode.
3. Check Vercel function logs, then Supabase logs/RLS only if the request reached persistence.
4. Reproduce with the smallest public request; do not use a production editor session unless required.
5. Roll back application-only failures immediately. For database failures, preserve data and prefer a forward corrective migration.

## Troubleshooting

### Production shows demo content

Both Supabase environment values must be non-empty in the Vercel environment that built the deployment. Confirm Preview/Production scope, redeploy, and verify real content. Never print key values.

### Metadata or share URLs use localhost

Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin and redeploy. Public variables are build-time values.

### Supabase returns 401/403 or editor writes fail

- Confirm the Auth session is valid.
- Confirm `public.profiles.id` exactly matches `auth.users.id`.
- Confirm the profile role is `editor` or `admin`.
- Confirm both project URL and anon key belong to the same Supabase environment.
- Keep RLS enabled; do not solve authorization failures with a service-role key in the app.

### Production has no articles

Schema migration alone does not seed Production. Confirm at least one localized article has `status='published'` and a non-future `published_at`, plus a same-locale category and author.

### Search returns no expected translation

Search is locale-scoped. Confirm the translated row exists, uses the requested locale, and has its own published state. Do not expect English results in an Italian query.

### MCP browser call is blocked by CORS

Add the exact caller origin (scheme, host, and port) to `MCP_ALLOWED_ORIGINS`, comma-separated, then redeploy. CLI/agent clients that omit `Origin` should continue to work. `GET /api/mcp` returning 405 is expected; use POST.

### MCP call times out

Check database region alignment, query indexes, Vercel cold-start logs, and result limit. Do not raise the 10-second ceiling before locating the slow boundary.

### `npm ci` fails

The lockfile and `package.json` differ. Regenerate the lockfile intentionally with the supported npm/Node version, review the dependency diff, and commit them together. Do not replace `npm ci` with `npm install` in CI.

### Supabase migration history differs

Run `npx supabase migration list` and inspect local/remote versions. Do not run `migration repair`, `db reset --linked`, or destructive SQL until the exact history mismatch and target project are proven.

## Rollback

### Application

1. Select the last known-good Vercel deployment built with the intended environment variables.
2. Promote/redeploy it to Production.
3. Verify `/en`, `/it`, one article, newsletter, editor authorization, and MCP.

Application rollback does not undo database migrations.

### Database

- Take a backup or verify point-in-time recovery before every material production migration.
- Prefer a new forward migration that restores compatibility and preserves data.
- For destructive schema changes, use expand/migrate/contract across separate releases so the previous app remains compatible during rollout.
- Restore from backup only with an explicit recovery plan and accepted data-loss window.
- Never use `supabase db reset --linked` on Production.

### Environment

Restore the previous Vercel environment values and redeploy; changing a public value without rebuilding does not change an existing client bundle.

### Content

Move a bad publication back to draft/review or publish a corrected localized revision. Verify removal from the anonymous site, sitemap behavior, feeds, and MCP after cache invalidation.

## Post-rollback proof

Record the deployment ID, Git commit, database migration version, restored environment scope, smoke-check results, and any known data gap. A Vercel “Ready” state alone is not rollback proof.
