# AtlasNews design system

The canonical visual contract is [DESIGN.md](../../DESIGN.md). It contains normative structured tokens and human-readable application rules in the Google design.md format.

Generated concepts remain QA references, not a second source of truth.

## Checks

- `pnpm design:lint` validates DESIGN.md; `pnpm design:tokens:check` fails when `apps/web/src/app/design.tokens.css` is out of date (`pnpm design:tokens:write` regenerates it with the colour, spacing, radius and type-size tokens).
- `pnpm design:css` keeps the stylesheets on those scales: every font size is a `--text-*` token or em, every padding, margin and gap a `--space-*` token, every media query a DESIGN.md breakpoint, and the only px a 1px hairline. All three run in `pnpm check`.
- `pnpm responsive:check [origin]` opens the reader site and Studio in Chromium at 320, 375, 768, 1024, 1440 and 1920 px, at 100% and 200% text, and fails on sideways scrolling, text under 12px, or a control under 44px on touch screens (24px with a mouse). It needs a running app with the demo Studio (`ATLASNEWS_CONTENT_MODE=demo ATLASNEWS_ENABLE_DEMO_STUDIO=true pnpm start`); `--shots <dir>` keeps phone and desktop screenshots. Run it after a layout change.
