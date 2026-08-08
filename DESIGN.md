---
version: alpha
name: NEURA
description: Editorial Swiss restraint for an international English-first AI publication and bilingual newsroom.
colors:
  primary: "#0a0a0a"
  paper: "#f4f1ec"
  paper-raised: "#faf9f6"
  ink: "#0a0a0a"
  muted: "#65635f"
  rule: "#c9c7c1"
  rule-strong: "#9a9893"
  coral: "#f04e3e"
  coral-dark: "#cc3529"
  success: "#397a32"
  warning: "#b46b00"
  info: "#23759a"
  white: "#ffffff"
typography:
  display-xl-mobile:
    fontFamily: Barlow Condensed
    fontSize: 4.1rem
    fontWeight: 700
    lineHeight: 0.82
    letterSpacing: -0.048em
  display-xl-desktop:
    fontFamily: Barlow Condensed
    fontSize: 7.6rem
    fontWeight: 700
    lineHeight: 0.82
    letterSpacing: -0.048em
  display-lg:
    fontFamily: Barlow Condensed
    fontSize: 6.4rem
    fontWeight: 700
    lineHeight: 0.84
    letterSpacing: -0.045em
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
  sm: 2px
  md: 8px
  media: 12px
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
    textColor: "{colors.ink}"
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
---

## Overview

NEURA combines Swiss editorial structure with the tactility of a contemporary print magazine. The public product must feel decisive, calm, and authored. The studio translates the same identity into a dense newsroom tool without becoming a generic SaaS dashboard.

Mobile is the base composition. Desktop adds columns and rails; it never changes content hierarchy. Public pages render useful HTML before client JavaScript.

## Colors

Paper is deliberately warm, never pure white. Ink carries all primary text and large surfaces. Coral is the only expressive accent: primary actions, focus, selected state, and small editorial signals. Muted and rule tokens create hierarchy without cards or shadows.

Semantic colors appear only for operational status inside Studio. They never decorate public editorial surfaces.

## Typography

Barlow Condensed is reserved for the NEURA masthead and major editorial display. Inter Variable owns headlines, navigation, metadata, controls, and Studio chrome. Source Serif 4 Variable owns decks and reading copy.

Display sizes scale fluidly between the mobile and desktop tokens. Reading measure stays between 58 and 72 characters. Control type is always explicit; browser-default typography is prohibited.

## Layout

The maximum public shell is 1536px. Gutters are 20px on mobile, 32px on tablet, and 40px on desktop. Public pages use open grids, horizontal rules, lists, and bands. Nested cards and universal rounded wrappers are prohibited.

The home hierarchy is statement, image, feature copy, latest rail, spotlight, briefing, topics. Studio uses navigation rail, article list, and inspector; these become drawer, list, and full-screen sheet on mobile. Interactive targets are at least 44px.

## Elevation & Depth

Depth comes from typography, overlap-free grid rhythm, media contrast, and sticky navigation. Shadows are exceptional: only the open mobile navigation may use a restrained shadow. No glass surfaces, blurred cards, or decorative glow.

## Shapes

Controls are square or 2–8px rounded. Editorial media uses 12px rounding. Avatars and icon-only controls may be circular. Rules are 1px; active navigation and focus accents are 2–3px coral.

## Components

Header contains brand, essential navigation, search, and one account action. Feature stories use one dominant local image, category, headline, deck, primary read action, save, and share. Story lists stay open and rule-separated.

Newsletter is one near-black band with a coral mail block and a single email action. Studio uses a real table/list and inspector; metrics remain secondary. Social distribution always offers preview and deliberate publish state, never silent automatic posting.

Icons use Lucide at 1.75px stroke when the metaphor exists. Brand marks such as `in`, `X`, and `WA` use restrained monochrome text, not unrelated generic icons.

## Do's and Don'ts

Do preserve the above-the-fold copy lock, paper temperature, open container model, sharp typography, stable image ratios, visible focus, and reduced-motion behavior.

Do not add hero eyebrows, pills, fake metrics, bento grids, neon, glassmorphism, blue-purple gradients, giant rounded wrappers, stock photography, color overlays on hero art, or client-side data fetching for content available on the server.
