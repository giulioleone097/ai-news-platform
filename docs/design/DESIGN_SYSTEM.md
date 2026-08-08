# NEURA design system

Source concepts live outside the repository in the Codex visualization workspace. This file is the implementation lock.

## Direction

- Editorial Swiss grid, open layout, varied rhythm. No generic card dashboard.
- Background: intentional paper `#f4f1ec`; ink `#0a0a0a`; coral `#f04e3e`; rule `#c9c7c1`.
- Masthead and display: Barlow Condensed 700. Reading: Source Serif 4 Variable. UI: Inter Variable.
- Controls: square or `8px` radius; media: `12px`; almost no shadow.
- Icons: Lucide, `1.75px` stroke, monochrome; coral only for active/primary states.
- Motion: 160–240ms, hierarchy only; disabled under `prefers-reduced-motion`.

## Type

| Token | Mobile | Desktop | Use |
| --- | ---: | ---: | --- |
| `display-xl` | `clamp(3.6rem, 17vw, 5.8rem)` | `clamp(5rem, 8vw, 8.5rem)` | Home statement |
| `display-lg` | `3rem` | `5.4rem` | Article title |
| `headline` | `2rem` | `3.25rem` | Feature story |
| `section` | `1.65rem` | `2rem` | Section title |
| `body` | `1.1rem` | `1.2rem` | Reading copy |
| `ui` | `0.875rem` | `0.9rem` | Controls and labels |

## Layout

- Mobile-first base gutter: `20px`; tablet `32px`; desktop `40px`.
- Content max width: `1536px`.
- Minimum interactive target: `44px`.
- Public first viewport: statement → hero art → feature copy → live rail.
- Studio: navigation rail → article list → inspector; drawer/list/sheet on mobile.

## Above-the-fold copy lock

`NEURA`, `Ultime`, `Aziende`, `Ricerca`, `Policy`, `Strumenti`, `Accedi`, `L’intelligenza artificiale, senza rumore.`, `Notizie, analisi e strumenti per capire cosa cambia davvero.`, `Gli agenti AI entrano nel lavoro quotidiano`, `Leggi l’analisi`, `Salva`, `Condividi`, `Ora`.
