# Internationalization

NEURA is English-first and explicitly localized. English is the default content language; Italian has equal route and content support.

## Routing contract

- Supported locales: `en`, `it`.
- Default locale: `en`.
- Every human-facing route is prefixed: `/en/...` or `/it/...`.
- `/` and other unprefixed site routes redirect with HTTP 308 to the equivalent English path.
- `/api/*` and static assets are never locale-prefixed.
- Unsupported locale segments do not silently select a different language.

Examples:

| English | Italian |
| --- | --- |
| `/en` | `/it` |
| `/en/latest` | `/it/latest` |
| `/en/feed.xml` | `/it/feed.xml` |
| `/en/categories/research` | `/it/categories/ricerca` |
| `/en/articles/ai-agents-enter-everyday-work` | `/it/articles/gli-agenti-ai-entrano-nel-lavoro-quotidiano` |

The locale switcher resolves translated peers through shared translation identity where available; a missing translation must remain visibly unavailable rather than rendering content in the wrong language.

## UI messages

Message catalogs live in:

```text
src/i18n/messages/en.ts
src/i18n/messages/it.ts
```

English defines the message shape. Each additional catalog must satisfy the same TypeScript contract, keeping navigation, validation, empty states, studio copy, and accessibility labels complete.

Do not place user-visible copy directly in shared components when it varies by locale. Dates and times must use locale-aware formatters.

## Content model

Categories and articles are separate rows per locale.

- `translation_key` links semantic peers across languages.
- `locale` identifies the row language.
- `slug` is localized and unique within a locale.
- `(translation_key, locale)` is unique.
- Article/category relationships enforce the same locale.
- Full-text search uses the English or Italian PostgreSQL dictionary for each row.

English content is canonical for editorial planning, but translations are independently publishable. Publication state is per localized row; publishing English never publishes an incomplete Italian draft.

## SEO

Localized pages emit:

- a locale-specific canonical URL;
- `hreflang` alternates for available peers;
- an `x-default` entry pointing to English;
- localized title, description, structured data, and article metadata;
- locale-prefixed sitemap URLs.
- one RSS 2.0 feed per locale, containing only that locale's published content.

Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin before build so absolute metadata is correct.

## MCP

All public MCP tools accept `locale`; it defaults to `en`. Tool output includes locale and locale-prefixed paths. A missing article in the requested locale returns a not-found tool error rather than falling back.

## Add a locale

Adding a locale is a code-and-content change, not configuration-only:

1. Add the locale to `src/i18n/index.ts` and provide a complete message catalog.
2. Add locale-aware date/time formatting and UI tests.
3. Add translated categories with the existing `translation_key` values.
4. Add translated articles with locale-specific slugs and alt text.
5. Confirm PostgreSQL full-text configuration; unsupported dictionaries intentionally fall back to `simple` until a migration adds the right config.
6. Extend static params, sitemap/metadata expectations, and MCP schema tests.
7. Test root routing, locale switching, search, newsletter, studio, and translated peer links.

Do not declare a locale supported until navigation, validation, metadata, seed/reference content, and editorial workflow are complete.
