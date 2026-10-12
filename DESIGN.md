---
version: alpha
name: AtlasNews
description: A fast-scanning AI news desk. White page, black type, one yellow marker, and a four-step meter that shows how firmly each story stands.
colors:
  primary: "#111214"
  paper: "#ffffff"
  paper-sunken: "#f4f4f1"
  ink: "#111214"
  muted: "#5c5d59"
  rule: "#e3e3de"
  rule-strong: "#b8b8b1"
  control: "#767670"
  marker: "#ffd60a"
  marker-deep: "#f5c400"
  success: "#1f7a3d"
  warning: "#a85b00"
  danger: "#c0281c"
  info: "#1d5fd1"
  white: "#ffffff"
  night: "#0f1012"
  night-raised: "#1a1b1e"
  night-rule: "#2d2f33"
  night-rule-strong: "#55575c"
  night-control: "#7a7c82"
  night-ink: "#f3f3ef"
  night-muted: "#a4a59f"
  plate-sky: "#c9e4ff"
  plate-leaf: "#d7f2d0"
  plate-peach: "#ffd4c7"
  plate-lilac: "#e4dcff"
  plate-sand: "#f1e6c8"
typography:
  display:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 3rem
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 2rem
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.025em
  headline:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1.75rem
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.02em
  title:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1.125rem
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  deck:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: Newsreader Variable
    fontSize: 1.1875rem
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 0.9375rem
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.3
rounded:
  none: 0rem
  sm: 0.25rem
  md: 0.5rem
  lg: 0.75rem
  full: 999rem
spacing:
  xxs: 0.25rem
  xs: 0.5rem
  sm: 0.75rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  2xl: 3rem
  3xl: 4.5rem
  gutter-mobile: 1.25rem
  gutter-desktop: 2.5rem
components:
  button-primary:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: 0.625rem 1rem
    height: 2.75rem
  button-primary-hover:
    backgroundColor: "{colors.marker-deep}"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    height: 2.75rem
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.white}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
  header:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: 4rem
  status-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  newsletter-band:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 1.5rem 2rem
  surface-sunken:
    backgroundColor: "{colors.paper-sunken}"
    textColor: "{colors.primary}"
  metadata:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  metadata-sunken:
    backgroundColor: "{colors.paper-sunken}"
    textColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.rule}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.rule-strong}"
    height: 1px
  story-title:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
  story-deck:
    textColor: "{colors.muted}"
    typography: "{typography.deck}"
  article-title:
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  article-title-mobile:
    textColor: "{colors.ink}"
    typography: "{typography.display-mobile}"
  section-title:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
  article-body:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  media-frame:
    backgroundColor: "{colors.paper-sunken}"
    rounded: "{rounded.md}"
  cover-plate-marker:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.ink}"
  cover-plate-sky:
    backgroundColor: "{colors.plate-sky}"
    textColor: "{colors.ink}"
  cover-plate-leaf:
    backgroundColor: "{colors.plate-leaf}"
    textColor: "{colors.ink}"
  cover-plate-peach:
    backgroundColor: "{colors.plate-peach}"
    textColor: "{colors.ink}"
  cover-plate-lilac:
    backgroundColor: "{colors.plate-lilac}"
    textColor: "{colors.ink}"
  cover-plate-sand:
    backgroundColor: "{colors.plate-sand}"
    textColor: "{colors.ink}"
  control-outline:
    backgroundColor: "{colors.control}"
    height: 1px
  night-control-outline:
    backgroundColor: "{colors.night-control}"
    height: 1px
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.white}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.white}"
  status-info:
    backgroundColor: "{colors.info}"
    textColor: "{colors.white}"
  night-page:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-ink}"
  night-surface:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.night-ink}"
  night-metadata:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-muted}"
  night-divider:
    backgroundColor: "{colors.night-rule}"
    height: 1px
  night-divider-strong:
    backgroundColor: "{colors.night-rule-strong}"
    height: 1px
---

## Overview

AtlasNews follows AI products from the first rumour to the release. A reader arrives to answer two questions fast: what changed today, and how much of it is real. The design is a news desk, not a magazine: a white page, black type, pictures where a story has one, and a single yellow marker that points at what matters.

The signature is the status meter. Every story carries four small bars that fill as its claim firms up: rumour, in test, rolling out, confirmed. It is the one device no other AI news site has, so it appears wherever a story does and nothing else competes with it.

Studio, the editors' side, uses the same tokens at tool density: small sentence-case headings, tables, and forms. Most editing happens through AI assistants, so Studio stays lean.

## Colors

Paper is white and ink is near-black. Sunken paper marks bands, inputs and quiet panels. Muted ink is for metadata only. Rules separate; they never decorate.

Marker yellow is the only accent. It fills the primary button, the newsletter band, the selected navigation item, the wordmark stroke, and the highlight that appears under a headline on hover. Yellow is always a background behind ink; it is never a text color on a light page.

Four pale plate tints (sky, leaf, peach, lilac) plus the marker color fill cover plates: the typographic tile a story gets when it has no picture of its own. A category always gets the same tint, so the tint reads as the section. Plates keep their light tints and ink text in the dark theme, as pictures do.

Success, warning, danger and info are for operational states in Studio and for form feedback. The status meter uses ink, not color, so it reads the same in both themes and for every kind of vision.

The dark theme follows the system setting. It swaps paper for night, ink for night-ink, and keeps the marker as it is.

## Typography

Schibsted Grotesk, a typeface drawn for news interfaces, sets everything a reader scans: headlines, decks, navigation, metadata, controls and all of Studio. Newsreader sets the body of an article and nothing else.

Headlines are heavy and tight, in sentence case. The largest size on the site is the article title at 3rem; there are no poster-sized headings. Labels and metadata are sentence case at normal tracking. Uppercase is not used for labels, eyebrows or headings.

Reading measure for article body is 60 to 72 characters. Card and row titles wrap to at most three lines.

## Layout

The public shell is 1280px wide with 20px gutters on phones and 40px on desktop. The header is one row: wordmark, the products readers follow, then search, language and Subscribe. On a phone the products scroll sideways on a second row.

The home page reads in three steps of decreasing size. First the lead story with its picture. Then three stories as cards with a picture or a cover plate. Then a band that explains the status meter, and every other story as a dated stream of compact rows beside the most covered products. The newsletter band and the topics close the page.

An article is one column: status, title, deck, byline row, picture, then the body beside a sticky table of contents on wide screens. Lists (products, search, a topic, a status) reuse the stream rows so every list on the site scans the same way.

Studio is a narrow navigation column and one working area. Lists are tables. Forms put the content on the left and the publishing settings in a side panel. Interactive targets are at least 44px on touch screens.

## Elevation & Depth

Flat. Hierarchy comes from size, weight and rules. Only overlays (menus, dialogs, the sticky header) carry a shadow or a border to separate them from the page.

## Shapes

Corners are small: 4px on chips and inputs, 8px on buttons, pictures and panels, 12px on the newsletter band and dialogs. Nothing is pill-shaped except the avatar and the on/off switch.

## Components

Status chip: a glyph followed by the status word. The glyph is the four-bar meter: rumour fills one bar, in test two, rolling out three, confirmed four. Analysis is not a claim, so its glyph is three lines of text instead of bars. The word is always present.

Cover: the story's picture at 16:10. When a story has no picture of its own, or its picture already appears higher on the page, the cover is a plate: the section tint, the story's status glyph drawn large in the corner, and the product or section name set large.

Story row: status chip, product or section, time, headline. The whole row is one link. Story card: cover, the same meta line, headline, deck.

Buttons: primary is marker yellow with ink text; secondary is an ink outline; destructive actions are danger red and always ask first. One primary button per view.

Newsletter band: marker yellow, one email field, one button.

Icons are Lucide at 1.75px stroke. Brand marks such as `in`, `X` and `WA` are set as text.

## Do's and Don'ts

- Do show the status chip on every story, everywhere.
- Do write labels and headings in sentence case.
- Do let a list be a list: rows and rules, not a grid of boxes.
- Do size everything in rem or em, so the page follows the reader's text size. Only a 1px hairline is in px.
- Don't use yellow as text on a light page, or for anything that is not a highlight or a primary action.
- Don't number sections or steps unless they are a real sequence.
- Don't show a count that is zero; leave the count out.
- Don't add a second accent color, a gradient, or a decorative illustration.
