---
version: alpha
name: AtlasNews
description: Contemporary product-led editorial design for an international English-first AI publication and bilingual newsroom.
colors:
  primary: "#151719"
  paper: "#f3f5f6"
  paper-raised: "#ffffff"
  ink: "#151719"
  muted: "#626970"
  rule: "#d7dce0"
  rule-strong: "#aeb5bb"
  coral: "#c64a3b"
  coral-dark: "#a93629"
  success: "#397a32"
  warning: "#c17a10"
  info: "#23759a"
  white: "#ffffff"
  claim-confirmed: "#1e3a1c"
  claim-confirmed-ink: "#9fd699"
  claim-rollout: "#3d211d"
  claim-rollout-ink: "#f0a497"
  claim-test: "#1b3442"
  claim-test-ink: "#93cbe6"
  claim-rumour: "#43301a"
  claim-rumour-ink: "#f0c27a"
  claim-analysis: "#2a2e32"
  claim-analysis-ink: "#c9ced3"
typography:
  display-xl-mobile:
    fontFamily: Inter Variable
    fontSize: 3.35rem
    fontWeight: 760
    lineHeight: 0.94
    letterSpacing: -0.055em
  display-xl-desktop:
    fontFamily: Inter Variable
    fontSize: 6.25rem
    fontWeight: 760
    lineHeight: 0.92
    letterSpacing: -0.06em
  display-lg:
    fontFamily: Inter Variable
    fontSize: 5.25rem
    fontWeight: 750
    lineHeight: 0.94
    letterSpacing: -0.055em
  headline:
    fontFamily: Inter Variable
    fontSize: 3.5rem
    fontWeight: 720
    lineHeight: 0.98
    letterSpacing: -0.045em
  section:
    fontFamily: Inter Variable
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.035em
  body:
    fontFamily: Source Serif 4 Variable
    fontSize: 1.2rem
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: Inter Variable
    fontSize: 0.9rem
    fontWeight: 600
    lineHeight: 1.25
  label:
    fontFamily: Inter Variable
    fontSize: 0.75rem
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: 0.04em
rounded:
  none: 0px
  sm: 8px
  md: 12px
  media: 16px
  full: 999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 72px
  gutter-mobile: 20px
  gutter-desktop: 40px
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.white}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: 12px 20px
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.coral-dark}"
    textColor: "{colors.white}"
  button-quiet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    height: 44px
  header:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: 76px
  media-frame:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.media}"
  newsletter-band:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    padding: 20px 24px
  focus-ring:
    backgroundColor: "{colors.coral}"
    size: 3px
  surface-raised:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.primary}"
  metadata:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  divider:
    backgroundColor: "{colors.rule}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.rule-strong}"
    height: 1px
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.white}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.ink}"
  status-info:
    backgroundColor: "{colors.info}"
    textColor: "{colors.white}"
  claim-chip-confirmed:
    backgroundColor: "{colors.claim-confirmed}"
    textColor: "{colors.claim-confirmed-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  claim-chip-rollout:
    backgroundColor: "{colors.claim-rollout}"
    textColor: "{colors.claim-rollout-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  claim-chip-test:
    backgroundColor: "{colors.claim-test}"
    textColor: "{colors.claim-test-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  claim-chip-rumour:
    backgroundColor: "{colors.claim-rumour}"
    textColor: "{colors.claim-rumour-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  claim-chip-analysis:
    backgroundColor: "{colors.claim-analysis}"
    textColor: "{colors.claim-analysis-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
---

## Overview

AtlasNews is a contemporary AI intelligence product with editorial depth. The public experience must feel decisive, visual, fast, and authored without borrowing the visual codes of a printed newspaper. The studio translates the same identity into a dense newsroom tool without becoming a generic SaaS dashboard.

Mobile is the base composition. Desktop adds columns and rails; it never changes content hierarchy. Public pages render useful HTML before client JavaScript.

## Colors

The neutral palette is cool and precise, moving from silver-grey canvas to clean raised surfaces. Ink carries all primary text and large surfaces. Coral is the only expressive accent: primary actions, focus, selected state, and small editorial signals. Muted and rule tokens create hierarchy without glow or decorative gradients.

Semantic colors appear for operational status inside Studio. On public surfaces the only added colors are the five claim chips, which tell a reader how firmly a story stands: confirmed, rolling out, in test, rumour, analysis. Each chip is a dark pill with light text and keeps at least 4.5:1 contrast on both the light and the dark page; it always carries its word, never color alone. Nothing else on a public page uses them.

## Typography

Barlow Condensed is reserved for the wordmark when it is used. Inter Variable owns display headlines, decks, navigation, metadata, controls, and Studio chrome. Source Serif 4 Variable is confined to long-form article body copy.

Display sizes scale fluidly between the mobile and desktop tokens. Reading measure stays between 58 and 72 characters. Control type is always explicit; browser-default typography is prohibited.

## Layout

The maximum public shell is 1536px. Gutters are 20px on mobile, 32px on tablet, and 40px on desktop. Public pages use asymmetric product grids, contained media, structured streams, and a small number of raised modules. Cards exist only where containment clarifies hierarchy.

The home hierarchy is header, entity navigation, status filter, one static lead story, then one dated stream grouped by day, with the briefing and topics after it. At least seven stories show on a 375 by 812 phone before any scroll. Studio uses navigation rail, article list, and inspector; these become drawer, list, and full-screen sheet on mobile. Interactive targets are at least 44px.

## Elevation & Depth

Depth comes from typography, restrained raised surfaces, image contrast, sticky navigation, and cool tinted shadows. No glass surfaces, neon, blurred cards, or decorative glow.

## Shapes

Controls use 8px rounding, product modules use 12px, and editorial media uses 16px. Avatars and icon-only controls may be circular. Rules are 1px; active navigation and focus accents are 2-3px coral.

## Components

Header contains brand, essential navigation, search, and one account action. Feature stories use one dominant local image, category, headline, deck, primary read action, save, and share. Story feeds read as compact product streams: time, claim chip, primary entity and headline on every row, a thumbnail only on the lead, and deliberate hover states. The product pages (entities) show a timeline from oldest to newest so a reader sees a rumour become a release.

Newsletter is one near-black band with a coral mail block and a single email action. Studio uses a real table/list and inspector; metrics remain secondary. Social distribution always offers preview and deliberate publish state, never silent automatic posting.

Icons use Lucide at 1.75px stroke when the metaphor exists. Brand marks such as `in`, `X`, and `WA` use restrained monochrome text, not unrelated generic icons.

## Do's and Don'ts

Do preserve the above-the-fold copy lock, sharp typography, stable image ratios, visible focus, dual-mode contrast, and reduced-motion behavior.

Do not add hero eyebrows, fake metrics, neon, glassmorphism, blue-purple gradients, giant rounded wrappers, decorative status dots, color overlays on hero art, or client-side data fetching for content available on the server.
