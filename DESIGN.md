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
  night-success: "#6fcf8a"
  night-warning: "#f08a3c"
  night-danger: "#ff8a7d"
  night-info: "#8fb6ff"
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
    letterSpacing: -0.03em
  headline-large:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 2.5rem
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.03em
  headline:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1.75rem
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline-small:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1.5rem
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: -0.02em
  title-large:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1.25rem
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  title:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1.125rem
    fontWeight: 700
    lineHeight: 1.3
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
  base:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  ui:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 0.9375rem
    fontWeight: 600
    lineHeight: 1.3
  ui-small:
    fontFamily: Schibsted Grotesk Variable
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.4
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
  "0-5": 0.125rem
  "1": 0.25rem
  "1-5": 0.375rem
  "2": 0.5rem
  "2-5": 0.625rem
  "3": 0.75rem
  "4": 1rem
  "5": 1.25rem
  "6": 1.5rem
  "8": 2rem
  "10": 2.5rem
  "12": 3rem
  "16": 4rem
  gutter-mobile: 1.25rem
  gutter-desktop: 2.5rem
  shell: 80rem
  shell-wide: 90rem
  measure: 35rem
  side-column: 20rem
  breakpoint-sm: 30rem
  breakpoint-md: 48rem
  breakpoint-lg: 60rem
  breakpoint-xl: 68rem
  breakpoint-2xl: 110rem
components:
  button-primary:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: 0.5rem 1rem
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
    typography: "{typography.headline-small}"
  page-title:
    textColor: "{colors.ink}"
    typography: "{typography.headline-large}"
  page-title-mobile:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
  card-title:
    textColor: "{colors.ink}"
    typography: "{typography.headline-small}"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.base}"
    rounded: "{rounded.sm}"
    height: 2.75rem
  field-hint:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.ui-small}"
  article-body:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  media-frame:
    backgroundColor: "{colors.paper-sunken}"
    rounded: "{rounded.md}"
  topic-tile-sky:
    backgroundColor: "{colors.plate-sky}"
    textColor: "{colors.ink}"
  topic-tile-leaf:
    backgroundColor: "{colors.plate-leaf}"
    textColor: "{colors.ink}"
  topic-tile-peach:
    backgroundColor: "{colors.plate-peach}"
    textColor: "{colors.ink}"
  topic-tile-lilac:
    backgroundColor: "{colors.plate-lilac}"
    textColor: "{colors.ink}"
  topic-tile-sand:
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
  night-status-success:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-success}"
  night-status-warning:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-warning}"
  night-status-danger:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-danger}"
  night-status-info:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-info}"
---

## Overview

AtlasNews follows AI products from the first rumour to the release. A reader arrives to answer two questions fast: what changed today, and how much of it is real. The design is a news desk, not a magazine: a white page, black type, pictures only where a story has one, and a single yellow marker that points at what matters.

The signature is the status meter. Every story carries four small bars that fill as its claim firms up: rumour, in test, rolling out, confirmed. It is the one device no other AI news site has, so it appears wherever a story does and nothing else competes with it.

Studio, the editors' side, uses the same tokens at tool density: small sentence-case headings, tables, and forms. Most editing happens through AI assistants, so Studio stays lean, and it shows where an agent did the work.

## Colors

Paper is white and ink is near-black. Sunken paper marks bands, quiet panels and the key points. Muted ink is for metadata only. Rules separate; they never decorate. Inputs, selects and other controls take the control gray for their border, which keeps 3:1 or more against paper (night-control on night), so a field reads as a field.

Marker yellow is the only accent. It fills the primary button, the newsletter band, the selected navigation item or segment, the underline of the current section, and the highlight that appears under a headline on hover. Yellow is always a background behind ink; it is never a text color on a light page and never a decoration: the bar beside the key points and beside a quote is ink. The accent is one token (`marker`, with `marker-deep` for hover), so changing it is a one-line change.

The brand mark is the one orange on the site, #E94A24. It is the logo artwork from the brand registry, pinned in `brand.lock.json` (the mark beside the name, the browser tab icon, the plugin icons), so it is not a token here and it is never used in the interface: no orange text, button, border or background.

Five pale tints (sky, leaf, peach, lilac, sand) mark the topic tiles: a topic always gets the same tint, so the tint reads as the section. They keep their light tints and ink text in the dark theme. The same tints color code syntax in an article. They are never a story cover.

Success, warning, danger and info are for operational states in Studio and for form feedback. The status meter uses ink, not color, so it reads the same in both themes and for every kind of vision.

The dark theme follows the system setting. It swaps paper for night, ink for night-ink, and keeps the marker as it is. The light-page semantic colors are too dark to read on night, so each has a lighter night twin (night-success, night-warning, night-danger, night-info).

## Typography

Schibsted Grotesk, a typeface drawn for news interfaces, sets everything a reader scans: headlines, decks, navigation, metadata, controls and all of Studio. Newsreader sets the body of an article and nothing else.

Headlines are heavy and tight, in sentence case. The largest size on the site is the article title at 3rem; there are no poster-sized headings. Labels and metadata are sentence case at normal tracking. Uppercase is not used for labels, eyebrows or headings. No text is smaller than label, 0.8125rem (13px at the browser's default size).

The scale has thirteen levels, each a token (`--text-<level>` in CSS, generated from this file):

| Level | Size | Where |
| --- | --- | --- |
| display, display-mobile | 3rem, 2rem | The article title, fluid between the two. |
| headline-large, headline | 2.5rem, 1.75rem | Page titles and the home lead, fluid between the two. |
| headline-small | 1.5rem | Section titles, story cards, the newsletter band, Studio page titles, Markdown h2. |
| title-large | 1.25rem | The article deck on wide screens, Markdown h3 and quotes, empty states, the Studio title field, the reader wordmark. |
| title | 1.125rem | Story rows, entity rows, small section titles, dialog titles, the Studio wordmark. |
| deck | 1.125rem | Decks and the short paragraph under a page title, in the regular weight. |
| body | 1.1875rem | The article body, in Newsreader. |
| base | 1rem | The page base, every input (never smaller, so phones do not zoom in), short UI paragraphs. |
| ui | 0.9375rem | Buttons, navigation and controls. |
| ui-small | 0.875rem | Studio tables, hints and labels, small buttons, form messages, the card status chip. |
| label | 0.8125rem | Metadata, the row status chip, table headers, captions. |

The two fluid ramps grow with the screen through a rem plus vw middle term, so a reader who raises their text size still gets larger headings. Inside a component that scales with its own text (the status glyph, inline code), sizes are in em.

Reading measure for article body is 60 to 72 characters: the body is 35rem wide. Card and row titles wrap to at most three lines. Times are in UTC, and a dated list says so once, beside its first day heading.

## Layout

Spacing comes from one scale: `--space-N` is N quarter-rems, so the steps are 0.125rem (0.5), 0.25rem (1), 0.375rem (1.5), 0.5rem (2), 0.625rem (2.5), 0.75rem (3), 1rem (4), 1.25rem (5), 1.5rem (6), 2rem (8), 2.5rem (10), 3rem (12) and 4rem (16). The half steps are for chips, controls and icon gaps; blocks and sections use 1rem and up. Every padding, margin and gap uses a step; em is allowed inside a component that scales with its own text.

Five breakpoints, in rem so they follow the reader's text size, written as ranges such as `(width >= 48rem)` and `(width < 30rem)`:

| Breakpoint | Width | What changes |
| --- | --- | --- |
| sm | 30rem | Large phones: the header offers both languages, actions sit beside each other. |
| md | 48rem | Tablets: three story cards in a row, the time column in story rows, wider decks. |
| lg | 60rem | Two columns: the stream and its side column, the home lead beside its picture, the footer, the newsletter band. Studio's navigation column. |
| xl | 68rem | The header fits on one row and sticks; an article's contents sit beside its body. |
| 2xl | 110rem | The shell widens to 90rem. |

A component whose layout depends on the column it sits in, not on the screen, is a query container and answers to its own width: a story card steps its title down under 18rem, the newsletter band stacks its field and button under 16rem, the status legend sets each chip beside its line from 19rem, and in Studio the working area (the `studio` container) turns tables into cards under 40rem and puts the editor's side panel beside the form from 50rem. At 320px with the text at 200% nothing scrolls sideways: long words break and the wordmark wraps.

The public shell is 80rem wide (90rem from 110rem) with gutters from 1.25rem on phones (never more than a sixteenth of the screen, even at a large text size) to 2.5rem on desktop. The reading measure is 35rem and a side column 20rem. The header is one row: wordmark, Latest, the five products readers follow and Products, then search, language and Subscribe. The current section is marked. Where that row does not fit, on tablets and phones, the sections scroll sideways on a second row that fades at its edge. Subscribe jumps to the newsletter band, which closes every reader page above the footer.

The home page reads in three steps of decreasing size. First the lead story with its picture. Then three stories as cards: a card shows a picture only when the story has its own and the page has not shown it yet; otherwise it is a text card. Then a band that explains the status meter, and every other story as a dated stream of compact rows beside the most covered products, each with its latest status and date. The topics close the page.

An article is one column with one right edge: the way back to its topic, status, product, title, deck, byline row, picture, the key points, the story so far when its product has two stories or more, then the body beside a sticky table of contents on wide screens, the sources and the products in the story. Only the picture may run wider than the column.

Lists (Latest, search, a topic, a status, a product) reuse the stream rows so every list on the site scans the same way. A side column beside a list starts level with the first day of the list, not with the page title. The status legend appears on the home page and on the status pages, not beside every list.

An unknown address shows a page in the reader's language with the header and the footer.

Studio is a navigation column, grouped into Content, Audience, Publishing and Admin, beside one working area. The dashboard starts with what waits for an editor. Lists are tables with search, filters and pages. Forms put the content on the left and the publishing settings in a side panel; on a phone the publication settings sit below the excerpt and the save button names the action: save draft, publish or schedule. A feature that is not configured says what it does and who turns it on, with no empty table below. Controls in one row share one height, and interactive targets are at least 44px on touch screens.

## Elevation & Depth

Flat. Hierarchy comes from size, weight and rules. Only overlays (menus, dialogs, the sticky header) carry a shadow or a border to separate them from the page.

## Shapes

Corners are small: 0.25rem on chips and inputs, 0.5rem on buttons, pictures and panels, 0.75rem on the newsletter band and dialogs. Nothing is pill-shaped except the avatar and the on/off switch.

## Components

Status chip: a glyph followed by the status word. The glyph is the four-bar meter: rumour fills one bar, in test two, rolling out three, confirmed four. Analysis is not a claim, so its glyph is three lines of text instead of bars. The word is always present. The chip has three sizes: row, card, and lead (the home lead and the article head, where it links to the page of that status).

Cover: the story's own picture at 16:10. A story without one has no cover: its card is text only, with the same meta line, headline and deck.

Story row: status chip, product or section, time, headline. The whole row is one link. Story card: the picture when there is one, the same meta line, headline, deck.

Key points: up to three short lines on sunken paper with an ink bar, before the body.

Buttons: primary is marker yellow with ink text; secondary is an ink outline; destructive actions are danger red and always ask first, in a dialog that names what goes away. One primary button per view.

Newsletter band: marker yellow, one email field, one button. It is the last block of every reader page.

Topic tile: the topic's tint, its icon and its name. The topics are the only tinted tiles on the site.

Wordmark: the brand mark, then the name in Schibsted Grotesk 800 at title-large on the reader site (title in a phone's header and in Studio, where "Studio" follows in muted ui-small).

Icons are Lucide at a 1.75 stroke. Brand marks such as `in`, `X` and `WA` are set as text.

## Do's and Don'ts

- Do show the status chip on every story, everywhere.
- Do write labels and headings in sentence case.
- Do let a list be a list: rows and rules, not a grid of boxes.
- Do size everything in rem or em, so the page follows the reader's text size. Only a 1px hairline is in px.
- Do take every font size, padding, margin and gap from the tokens, and every media query from the five breakpoints; `pnpm design:css` fails on anything else.
- Do use a container query when a component's layout depends on its column rather than the screen.
- Do give each concept one name in each language, the same on the site, in Studio and in the tools for agents.
- Don't use yellow as text on a light page, or for anything that is not a highlight, a selection or a primary action.
- Don't number sections or steps unless they are a real sequence.
- Don't show a count that is zero; leave the count out.
- Don't add a second accent color, a gradient, or a decorative illustration. The brand mark's orange stays in the mark.
