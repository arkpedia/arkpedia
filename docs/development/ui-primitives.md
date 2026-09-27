# UI primitives and tokens

This is the reference for building or migrating any Arkpedia page. It covers the design tokens, the shared components in `components/ui`, the global rules, and the style audit and page-bounds checks that hold every page to them. Follow it literally. When a page needs something this page does not cover, add it here and to the primitives. Do not solve it inside the page.

The canonical style is the `/operators` list page plus `/gacha`, as decided on 2026-09-25:

- Section headings are `.op-section h2` in `--heading`, a teal-ish colour kept apart from the `--teal` that marks on/current states (maintainer, 2026-09-26; amber was tried and rejected).
- Picture and content cards (posters, banner art and thumbnails, operator and skin tiles, enemy tiles, album covers, portraits, video cards, the Terminal's stage, mode, supply and Regular Tasks cards, the /games and /community cards) carry **no resting border**, and no frame round the art inside them either: the art says they can be clicked. They keep a transparent 1px border so nothing shifts, and draw the teal edge on hover and keyboard focus (`border: 1px solid transparent`, `border-color: var(--teal)` on `:hover` and `:focus-visible`). A card in an on state keeps its teal edge, and a rarity ring is data, not a frame. Only real controls (buttons, chips, checkboxes, inputs, tabs, dropdowns) carry `--control-border` at rest, and large pressable surfaces (a selectable `.pick-card`, a row card like the pull planner's banner cell) carry the quieter `--card-border`; a control with only a small picture in it (a featured-operator chip, an appearance thumbnail) is one of them. `tests/browser/cards-and-headings.spec.ts` finds every link or button whose main content is a picture (40x40 or more, half its box or more) on twenty routes and fails on a framed one.
- Buttons are Rajdhani, uppercase, with 0.09em tracking.
- Controls in a row are one height, `--control-h` (36px, 40px at ≤720), and share one centre line.
- The page header has a mono teal eyebrow above a 30px Rajdhani h1.
- Everything sits in a 1040px frame with 24px gutters.
- Radii come from the 2–4px family.
- The operator detail page (`OperatorPage.module.css`) is being brought in line with this style. It is not a second reference. The one thing taken from it is `StyledSelect`.

## Where things live

| What | Where |
|---|---|
| Every token (colour, radius, frame, fonts) | `styles/core/shared.css`. Dark values are in `:root` and light values in `:root[data-theme="light"]`. Tokens are never defined anywhere else. |
| Primitive rules: buttons, chips, checkboxes, inputs, tabs, the live badge, rarity classes, panels | `styles/core/arkpedia-theme.css` |
| The global element rules: header, h1–h3, main, scrollbars, focus ring | `styles/core/shared.css` |
| The nav frame | `styles/core/nav.css` |
| React primitives | `components/ui/*` |
| Loaded webfont weights | `pages/_document.tsx` (Google Fonts URL) |

The global stylesheets load before every feature stylesheet (`pages/_app.tsx`). At equal specificity a feature rule therefore beats a primitive. That is how pages have been overriding the primitives, and migrating a page mostly means deleting those overrides.

CSS modules are used by the operator page, the games, the pulls workspace and `StyledSelect`. A module may style its own layout. It must not restate a primitive's paint: colours, borders, radii, button voice or heading sizes.

## The rules

1. **Teal means "on" or "current", and nothing else.** Selected chips, the current tab, the active nav item, a checked checkbox, a focused control and hover all use teal. Headings, resting links, decoration, rarity and categories must not be teal. "On" has one look everywhere: the `--teal-dim` fill with teal border and text (`.filter-chip[aria-pressed="true"]`, `.tgl.is-on`, `.pick-card` when picked), and for a checkbox a teal tick on the same `--teal-dim` box. The solid `--teal-fill` is `.primary`'s and never marks a state; `tests/browser/on-states.spec.ts` fails when a pressed, checked or `.is-on` control computes that fill, and when a checked checkbox is not the `.check` box (teal border on `--teal-dim`).
   - **One deliberate exception:** the automatic skill metric ("SP recovery: Auto", "Activation: Auto") is teal-bordered on `--teal-dim` on the operator page (`.skillMetricAuto` in `OperatorPage.module.css`) and in the `/gacha` operator preview (`.gacha-preview-skill-fact.auto` in `gacha.css`). The maintainer chose this in main's 2026-09-25 commit "Align gacha rarity borders and skill recovery colors", and it stays. Two older teal surfaces also stay, each with its own meaning: `.enemy-resist.vulnerable` on `/enemies` (a weakness, not a state) and the `/gacha` X1 button (the reference page, left as it is). Those are the only non-state teal surfaces. `audit:styles` (`tealDecoration`, strict) rejects teal on a selector that names no state in the page families already clean of it, today `styles/stages/`; elsewhere reviewing new ones is left to people, so keep this list in step with the code and add a family's folder to `TEAL_DECORATION_SCOPE` in `scripts/audits/audit-styles.mjs` once it is clean.
2. **One resting boundary for controls, and it is soft.** Anything that can be pressed, typed in, ticked or picked from has a `--control-border` border at rest, except a picture or content card, which has none (above). The border is a band, not WCAG 1.4.11's 3:1: at 3.5:1 every chip and field was a hard outline (maintainer, 2026-09-26: "too harsh"). A control reads as one through its fill (`--row-grad`, `--panel-2`, `--well`), its label or button voice, and the teal hover and focus; the border only has to be seen. A large pressable surface (a `.pick-card`, a row card, a tall disclosure row) takes the quieter `--card-border`, because a long outline at the chip's weight boxes in half the page. `--line` and `--line-soft` are for passive hairlines only (panels, dividers, table rules).
3. **Booleans and options are checkboxes.** A setting that is on or off ("Monthly card", "Include CN", "Include sparking") and an item in a list you tick (the stage guesser's chapters, the music guesser's releases) is a real `<input type="checkbox">` in a `<label className="check">`. It is never a `.tgl`, a `.filter-chip` with `aria-pressed` or a button drawing its own tick box: #64 turned eleven of them into highlighted buttons and the maintainer asked for the checkboxes back. `.tgl` is only a mode switch in a dense toolbar. `audit:styles` rejects a checkbox outside a `.check` label (`checkboxPrimitive`) and a `.tgl` outside `TGL_SCOPE` (`tglOutsideToolbar`), and `tests/browser/checkboxes.spec.ts` holds the known option groups to real checkboxes.
4. **One line, one height.** The cells of a row share one centre line: a button, input or select and the text or the other control beside it sit on the same vertical centre (and on one baseline where text sits beside text). A caption under a value hangs below it out of the flow rather than lifting the value off the centre, and a margin under one cell of a centred row belongs to the row, not the cell (`.hint` has no outer margin for this reason: its 18px lifted the /skins count 9px). The controls in a row are **one height, `var(--control-h)`**: chips, `.tgl`, `.ghost`, `.danger`, `.btn-sm`, `.btn-icon`, the search field, the StyledSelect trigger, and number inputs all read it as a min-height with small vertical padding, so the token decides the height whatever the font. A base or `.primary` button is 44px only as a standalone call to action; in a row it takes `.btn-sm` (see Buttons). No page states a control height of its own: `audit:styles` (`controlHeight`, strict) rejects a literal `height` or `min-height` on a control outside `styles/core` and on a primitive inside it. A `.btn-bare` button is a card, a tile or a tab until it draws a control's box: one bordered in `--control-border` (rule 2) is a control like any other (the /music queue's track title was a bordered bare button at a literal 36px beside 40px icon buttons on a phone, and both checks left every `.btn-bare` out). `tests/browser/row-census.ts` measures every flex row and grid, counting a bare button boxed on all four sides as a control (centres within 2px, control heights within 1px, and in a grid no control wider than the columns it spans: a column sized for the old 32px button held the 36/40px one and ran it into the gap, so a column that holds a control reads `var(--control-h)` too) and `tests/browser/row-alignment.spec.ts` runs it strict on every address and driven state the census visited, at 1440 and 390 (the site nav, the same fixed bar on every page, is measured once, in its own test), with a reasoned `ALLOWED` list that fails when an entry goes stale; the same spec flips `--control-h-base` to 32px and checks that every primitive follows. A line of text beside a control is put on the control's centre by its own offset, not by making every item control-height: the operator page's meta (stars, class, branch) is 20px lines starting `(var(--control-h) - 20px) / 2` down beside the section menu, since as control-height cells the two-line meta made the panel header, which is sticky on a phone, 151px against 127 (141 against 121 at 1440); `row-alignment.spec.ts` holds it to those ceilings. A row that grows with the token pays from its spacing, not from its text: on a phone the /music queue's three 40px icon buttons sit 2px apart in a row with 4px gaps and an 8px title inset, so each title keeps the 153px for its text it had beside 32px buttons (`row-alignment.spec.ts`, 390 on a touch screen).
5. **One hover rule.** On hover, the border and the text go to `--teal`. Destructive `.danger` controls are the exception: they stay red, and so are tabs: a tab has no border, and a hovered tab in teal would read as the current one, so its label goes from `--text-dim` to `--text`.
6. **Rarity colour comes only from `--rarity-N`**, through `<Rarity>`, `.rarity-N`, `.tier-N` or `.tier-fill-N`. 5★ is never teal.
7. **One frame.** The header, `main` and the nav share `--frame-max` (1040px) and `--page-gutter` (24px at every width). There are no per-feature gutters and no `main-wide`.
8. **One page header**, `<PageHeader>`, placed as a sibling of `<main>`.
9. **One dropdown**, `<StyledSelect>`. Never write a native `<select>` or a hand-built `role="listbox"` outside `components/ui`.
10. **Radii come from tokens**: `var(--radius)` (2px) by default, `var(--radius-frame)` (3px) for an outer frame or a floating menu, and `var(--radius-control)` (4px) at most for a tile-like control. Never use a literal, never 999px pills, and never a 50% circle except on an avatar, a dot, an image or a slider thumb (the calendar's month steps and three help or close buttons were circles). A control is never round, whatever its name says: `.btn-icon` names the glyph it holds, not a picture. `audit:styles` (`pills`) rejects both, and never lets a button, a class naming one (`btn`, `button`) or a control primitive pass as a picture; `ROUND_EXEMPT` in `scripts/audits/audit-styles.mjs` names the four round things whose selectors do not say so.
11. **Only loaded font weights.** Rajdhani 500/600/700, JetBrains Mono 400–700 and Inter 400–700 are loaded. Any other weight is faked by the browser as faux bold.
12. **Anti-Page Jump.** No state change may leave the document shorter than the reader's scroll position needs. See the `arkpedia-ui` skill. `components/ui/useHeightFloor` is the general-purpose fix, and `components/ui/useSwitchHold` the one for a tab switch or a view swap. `tests/browser/tabs.spec.ts` puts each strip at the top of the screen before every press, not once: placed once on the short panel, the press back from the tall one started with nothing to lose, and /recruitment's Cheat sheet -> Calculator (143px at 1440) and the planner's Experimental -> Simple (98px) clamped the reader and passed.
13. **Tabs and pick-one rows start on the section edge.** A strip of tabs is `<Tabs>` (or `.tabs` / `.tab` links between routes), and a pick-one row is `SegmentedControl`: both at content width, packed from the start of the line. The first tab's label, and the first chip's box, start where the section heading's text starts (or on the page frame, or on the panel's content edge). Nothing stretches them: no `flex: 1` on an item, no `justify-content: center` or `space-*` on the row, no equal `1fr` columns. A stretched chip centres its label, and the maintainer's mock put the first label ~30px right of the heading that way (2026-09-26); the r9 census found the site doing it on /operators/Amiya's voice lines (+29.8px), /recruitment (+45.6), the calendar layers (+62.5), the map tools (+49.6), the music guesser (+23.9), and the Terminal bar centred +26.9 off the frame. Equal cells are allowed only where they are the point, each with its reason in `STRETCH_ALLOWED` (`scripts/audits/audit-choices-badges.mjs`): the /stages/supplies week, the planner state form's E0/E1/E2, the music guesser's clip-length scale, the operator guesser's hint checklist, the music player's transport. `audit:styles` (`stretchedChoices`) rejects the CSS, and `tests/browser/tab-align.ts` measures the rendered page (the `tab-align` offence in page-bounds, on every route at 1440 and 390 in both themes, and `tests/browser/tabs.spec.ts` on the driven states).
14. **One live badge.** LIVE, LIVE NOW and RUNNING NOW are `<span className="badge-live">`: white mono caps on `--danger-solid`, 16px tall, one padding. A page places it (position, top, left) and paints nothing: the census found four looks for it (mono 9/700, Inter 10/700, teal on `--teal-dim` on /stages/all, the map's `.badge-tradeable`) and the primitive unused. `audit:styles` (`liveBadge`) rejects a font, background or colour on a live-badge class outside `arkpedia-theme.css`, and a LIVE text rendered without the class.
<!-- r9 headings-spacing: rules 15-17 -->
15. **One vertical rhythm, in two tokens.** A section heading sits `--heading-gap` (14px) above the first content under it, and stacked sections are `--section-gap` (36px) apart; the first content of every page starts 24px under the header hairline (`main`'s padding). `.op-section h2` has no top margin (it inherited the global h2's 18px, which put a page that opened with a section heading at 42px), and a heading row (a flex row holding the heading and a count or a button) carries `margin-bottom: var(--heading-gap)` itself. A flex or grid gap that sits between a heading and its content is part of that gap (`calc(var(--heading-gap) - <gap>)`, as `/music`'s queue and `/techniques`' umbrellas do). The 2026-09-26 census measured 12 heading gaps (0-30px) and 11 section gaps (0-44px). Deliberate others, each measured by what it is rather than listed by page: a disclosure header whose body hangs from it on a shared edge (`/farming`'s tiers, 0px); a board of boxed panels in a grid, which keeps its grid gap (the Terminal home and the home page, 14px); the music guesser's category rows (a hairline list); the slim Terminal pages at 700px and under (14px to the first content) and the operator page (16px, a workspace bounded to the viewport). `tests/browser/cards-and-headings.spec.ts` checks every section heading on 41 routes (14px ±2 below, 36px ±2 between stacked `.op-section`s) and `tests/browser/page-bounds.spec.ts` the first line of every page (`first-gap`, 24px ±2).
16. **Four heading roles, one voice each, all in `shared.css`.** A section heading is `.op-section h2`, or `h2.section-title` where it is not inside an `.op-section` (a home panel, a panel head, a disclosure header): Rajdhani 18px, 700, 0.03em, uppercase, `--heading`. A sub-section is the global `h3` (15px, 600, 0.04em, `--text-dim`). A name -- an entity, a dialog or a card -- is `.entity-title` (22px, 700, `--text`), with `.entity-title-sm` (18px) and `.entity-title-xs` (15px): never larger than 22px, and never larger than the section h2 above it (the operator's skill name is `-sm` under the 18px "Skills" h2; it was 22px). A micro-label is `.label-tag`, kept a heading only when it heads a group (the /support tiers, a stage's rank labels) and a `<p>` otherwise (the stage legend's group labels, inside a `role="button"` overlay). A page stylesheet places a heading and never paints it: `audit:styles` (`headingRules`, strict) rejects a font size, colour, tracking or case on an h2 or h3 -- or on a class the TSX puts on one -- outside `shared.css`, unless it carries `.entity-title` (22px at most) or `.label-tag`; the Stronghold companion's pop-out headings are the named exception. The spec above checks each section heading's look in both themes and each entity title's size.
17. **First lines start on the section's edge.** In a stack, every block's first line starts on its parent's content edge. Lists keep their markers in a 1.1em column at the text's edge (the site reset, `:where(ul, ol)`), which a numbered list widens as its markers grow: 1.7em from ten items ("10.") and 2.3em from a hundred (`cards-and-headings.spec.ts` puts a 5-, 12- and 105-item list in a page and fails a marker past its list's box); a checkbox sits at the left of its cell, not centred in it; a row's side padding does not push its first control in (the operator page's voice player and lines had 6px and 4px); the operator panel's reading area starts on the header's inset (`--panel-inset` in `OperatorPage.module.css`); a stacked dossier gives its art band the content's inset; a row card that holds its art inside its hover edge (a padding and a transparent border: the home panels' cards, the Terminal home's rows) is drawn out by exactly that inset, so its art starts on the column's edge and `--heading-gap` under the heading while the edge draws in the panel's padding; a sticky bar whose top padding is its air under the nav once stuck (the music and operator guessers' setup bars, the Stronghold lookup, the voice player) rises by that padding at rest. The one inset: a picture card's text keeps `--card-inset` (12px) from its flush art, because the card's teal hover edge boxes it -- the video, roster, stage-mode, skin and supply cards used 10, 11, 12 and 14px. `page-bounds.spec.ts` (`stack-align`) fails a first line 3-120px right of its parent's edge while a sibling starts on it; `tests/browser/stack-align-baseline.json` accepts only the card insets, and only at `--card-inset`. The video card's entry is required: the Check builds /community and /community/videos from a checked-in feed (below), so a card is always on the page.
18. **Glyph art is ink.** The class, branch and faction glyphs (`/class-icons/`, `/branch-icons/`, `/faction-icons/`) are white art on a transparent ground. They are drawn as `<OperatorGameIcon src label size>`, a mask in the ink of the line or control they sit in (teal on a pressed chip), never as an `<img>`: as images they were white on the light theme's near-white, so /operators' class and branch chips, the class line under every roster card, the operator page's synergy and technique glyphs, /techniques' branch badges and branch tables and the planner's roster chips were blank squares (the planner had patched its own with `invert(1)`). The one `<img>` is over an operator's portrait on the stage deploy bar, where the game draws it white with a shadow. `cards-and-headings.spec.ts` visits every place that draws one, in both themes, and fails a glyph drawn as an `<img>`, a glyph under 3:1 against what it sits on (WCAG 1.4.11), or a place that shows none.
19. **Nothing moves when the webfonts arrive.** Rajdhani, Inter and JetBrains Mono load from Google Fonts with `display=swap`, so the first paint is in the fallback face, and every paint where Google Fonts is blocked. So a box that the face could resize is sized without it: the page header's eyebrow and h1 carry line heights of their own (14px; 38px, 30px on a phone: what the webfonts' `normal` gives), where at `normal` each line was the fallback's height until the fonts came in and everything under the header moved down 4px on every page; a strip that wraps where its labels run out of room is given its rows (the game switcher: its own line under 720px, three games and then two under 560px, `components/minigames/GameLinks.module.css`) or kept to one row (the Terminal bar, under Tabs). `row-alignment.spec.ts` loads every game with Google Fonts refused and fails an eyebrow or h1 line, a switcher row or a header action that differs from the webfont's; `terminal-pages.spec.ts` does the same for the Terminal bar.
20. **The Check does not read live third-party feeds.** The community pages' videos come from the channels' YouTube feeds at build time, and those returned 404 for hours on 2026-09-27, so the pages built with "No videos found" and the picture-card and card-inset guards failed on every branch. The Check's Build step and the Playwright `webServer` set `ARKPEDIA_YOUTUBE_FEED_FIXTURE=tests/fixtures/youtube-feeds.xml`, and `lib/music/youtubeFeedsServer.ts` then reads that file instead of fetching (a fixture that is named and missing fails the build rather than render an empty feed). Deploy and `npm run dev` never set it, so production fetches live as before. `scripts/tests/test-youtube-feed-fixture.ts` holds all of that, including that check.yml and the Playwright config name the same file.
<!-- end r9 rules 15-17 -->

## Tokens

All values are in `styles/core/shared.css`. `scripts/tests/test-ui-tokens.ts` checks the contrast each token promises (in `npm test`), so a token edit that breaks legibility fails CI.

### Surfaces and text

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | #0f151b | #F1F3F5 | Page ground. Also the `theme-color` meta (`lib/nav/themeColor.ts`). |
| `--panel` / `--panel-2` | #18212a / #1b242d | #FBFCFD / #E7ECEF | Panels, and the surface one step up |
| `--well` | #111820 | #DEE4E8 | Inset fields (inputs), meter tracks |
| `--panel-dim` | #141c23 | #E9EEF1 | An inert control's ground |
| `--panel-grad`, `--row-grad`, `--row-grad-hi` | gradients | gradients | Panel, button and selected-row surfaces |
| `--text` / `--text-dim` / `--text-faint` / `--text-bright` | | | Body, secondary, micro-labels (at the AA floor), emphasis |

### Lines and controls

| Token | Dark | Light | Use |
|---|---|---|---|
| `--line` / `--line-soft` | white .10 / .06 | black .12 / .07 | Passive hairlines only |
| `--control-border` | white .25 | #98a3ab | The resting border of every control: 2.28:1 (dark) and 2.5:1 (light) on `--panel`, and 2:1 or more on every surface. `test-ui-tokens.ts` holds it between 2.2 and 2.6:1 on the panel, so it can soften no further and harden no further. |
| `--card-border` | white .16 | #bac2c8 | The quieter resting edge of a large pressable surface: `.pick-card`, a row card, a tall disclosure row. Between `--line` and `--control-border`. |

### Control height

| Token | Value | Use |
|---|---|---|
| `--control-h-base` | 36px | **The one value to change.** The height of every control in a row. The maintainer may flip it (to 32px, say): it is one line, and nothing else states a control height. |
| `--control-h` | `--control-h-base`, plus 4px at ≤720 (36 / 40 today; 32 / 36 flipped) | What controls read: `min-height: var(--control-h)` on the primitives, `height` or `width` of a square icon button, a joined stepper's parts at `calc(var(--control-h) - 2px)` inside its 1px frame. |

### Accent and state

| Token | Dark | Light | Use |
|---|---|---|---|
| `--teal` | #5fd9c6 | #07695a | On or current: text, borders, focus ring |
| `--teal-dim` | teal .14 | teal .12 | The fill behind a selected item. Teal text on it clears 4.5:1 in both themes. |
| `--teal-fill` / `--teal-fill-hi` | gradients | #0a7f6c→#097565 / darker | **Primary actions only** (`.primary`), with `--teal-ink` text |
| `--teal-ink` | #0a2621 | #FFFFFF | Text on a teal fill |
| `--heading` | #67cbdd | #0b6879 | Section headings (`.op-section h2` and the page headings built like it) |
| `--amber` | #e0aa4e | #8F5808 | Countdowns, costs, warnings (never headings) |
| `--danger` / `--danger-dim` / `--danger-solid` | | | Destructive actions and errors. Use `-solid` behind white text. |

### Data colours

| Token | Use |
|---|---|
| `--rarity-1` … `--rarity-6` | Rarity as text or an edge. Light values clear 4.5:1 on `--panel-2`. |
| `--rarity-fill-1` … `--rarity-fill-6` | Rarity as a surface behind near-black ink (`.tier-fill-N`). Same values in both themes. |
| `--cat-blue`, `--cat-yellow`, `--cat-orange`, `--cat-green`, `--cat-red`, `--cat-grey` | Categories: /base facility kinds and /farming stage kinds. Tint a surface with `color-mix(in srgb, var(--cat-blue) 15%, transparent)`. |

### Shape and frame

| Token | Value | Use |
|---|---|---|
| `--radius` | 2px | Default for every control and surface |
| `--radius-frame` | 3px | An outermost frame, a modal, a floating menu |
| `--radius-control` | 4px | The ceiling: icon tiles, large action buttons, `.tgl`, `.chip` |
| `--frame-max` | 1040px | The page frame (nav, header, main) |
| `--page-gutter` | 24px | The frame's side padding at every width |
| `--heading-gap` | 14px | A section heading (or its heading row) to the first content (rule 15) |
| `--section-gap` | 36px | Stacked sections: `.op-section`, the operator page, `/pulls`, the Terminal scenes (rule 15) |
| `--card-inset` | 12px | A picture card's text from its flush art (rule 17) |
| `--font-display` / `--font-mono` / `--font-body` | Rajdhani / JetBrains Mono / Inter | Display and buttons / data and labels / prose |

## Global rules

These apply to every page with no opt-in:

- `:where(a[class]) { color: inherit }`. A classed anchor takes its colour from its own class or its parent, never the browser's link blue. It has zero specificity, so any class that sets a colour wins.
- `code, kbd, samp` use `--font-mono`.
- `:root { accent-color: var(--teal) }` applies to native radios and ranges. Checkboxes are the drawn `.check` box (below).
- The theme's input rule is inside `:where()` and has zero specificity. A page class on an input always wins. Focus keeps the site's 2px teal outline. There is no `outline: none` and no halo.
- `input`, `select` and `textarea` use `font: inherit`, so there is no browser Arial.
- The scrollbar thumb rests at `--text-faint` everywhere (the `:root` default and the drawn `.sidescroll` bar). The drawn bar also turns teal on hover. `scrollbar-color` is inherited, so a nested vertical scroller sets at most `scrollbar-width` and takes the colour from `:root`. A thumb in `--line` or `--line-soft` (1.31:1) is rejected by `audit:styles` (`scrollbarThumb`).
- `.site-nav-trigger` is in sentence case at weight 400, like the nav links.
- `.hint` (mono 11px, `--text-faint`) is a voice, not a block: it has no outer margin, so a hint in a flex row sits on the row's centre line. A hint paragraph or block (`p.hint`, `div.hint`) keeps an 18px gap below it.

## Components (`components/ui`)

### PageHeader

The eyebrow, the h1 (30px, 24px at ≤720), an optional lede, optional actions, and the hairline. It renders the same markup as the reference pages.

```tsx
import PageHeader from '@/components/ui/PageHeader';

<>
  <PageHeader
    eyebrow="Rhodes Island // Personnel Archive"
    title="Operator roster"
    sub="Every operator on Global and CN."        // optional
    actions={<>{/* search, SegmentedControl, buttons */}</>}  // optional
  />
  <main>…</main>
</>
```

- `eyebrow` and `title` are required. Give each section its own eyebrow: seven pages sharing "Rhodes Island // Terminal" is a finding.
- `slim` reduces the vertical padding for a tool whose first screen is the tool (stage terminals, Stronghold, music). The title size stays the same.
- Render it **outside and before** `<main>`, never inside it. A header inside `main` starts 24px to the right of the content. The bounds test measures this.
- Do not restyle the h1 (size, case, colour). `audit:styles` rejects h1 size or case rules outside `shared.css`.

### Tabs

Use Tabs when one of N panels shows in place: a page's sections (Stronghold), an event's Banner / Rewards / Skins, an enemy's Resistances / Stages, an operator's skills, a view switch (Schedule's Events / Calendar, Recruitment's Calculator / Cheat sheet, the planner's Simple / Experimental and its per-operator view). A value you pick (a sort order, a level, a filter, a module's stage) is not a tab: it is SegmentedControl.

```tsx
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';

<Tabs
  label="Event sections"            // required: the tablist's name
  id="event-section"                // required: the stem of every tab and panel id
  value={section}
  onChange={chooseSection}          // runs in the click or key handler (Anti-Page Jump)
  options={[
    { value: 'banner', label: 'Banner' },
    { value: 'rewards', label: 'Rewards', count: 12 },
    { value: 'skins', label: 'Skins', icon: <img src={icon} alt="" />, disabled: !skins.length },
  ]}
/>
<section {...tabPanelProps('event-section', section)}>…</section>
```

- It renders `role="tablist"` of `<button role="tab" aria-selected aria-controls>`, and `tabPanelProps(id, value)` gives the panel its `id`, `role="tabpanel"` and `aria-labelledby`. Mount one panel at a time or keep them all and hide the others (`hidden`); either way the panel carries the props. Tests find a tab with `getByRole('tab', { name })`.
- Keyboard: the strip is one Tab stop (a roving tabindex on the current tab). Left and Right move and select, wrapping; Home and End jump to the ends; disabled tabs are skipped. A click selects without a scripted `focus()`, so pressing a tab never scrolls the page (measured: a real click on the operator page's skill tabs leaves its pane where it was); the keyboard moves focus with the selection.
- Ids come from the props, not `useId`, so the server HTML and the browser agree (no hydration mismatch). The Check runs a production build, where React reports no attribute mismatch at all and a text one only as an uncaught "Minified React error #418/#423/#425", so `tests/browser/tabs.spec.ts` watches both channels on every page whose strips it presses (it watched only Stronghold, and a text mismatch beside /recruitment's view tabs passed) and, for what an attribute mismatch leaves behind, presses every tab of every strip starting from one the page does not mark current: each press must make its tab current and show its panel. A strip whose initial value the browser works out differently from the server (a `window` read in render, `/schedule?view=calendar` read from `location` instead of the router) draws one tab current and holds another, and its press does nothing; the press-through fails on it.
- The look is `.tabs` / `.tab` (`arkpedia-theme.css`): labels at content width in the button voice (Rajdhani 600, 13px, uppercase, 0.09em), no box and no side padding, so the first label starts on the heading's edge (rule 13). `--text-dim` at rest, `--text` on hover, `--teal` with a static 2px `--teal` underline when current. The weight never changes with the state, so switching cannot re-wrap the strip. An `icon` is drawn at 28px before the label; `count` is a mono figure after it.
- The underline is each tab's own `::after`. A sliding indicator can replace it later without touching the markup; nothing animates today.
- A page places the strip (margins) and never restyles a tab: no side padding, border or fill from a feature rule (the planner's old `.simple-operator-tabs button` rule did all three). The `tab-align` census fails a boxed `.tab`.
- Vertically, a strip is measured by its tabs' boxes, like a chip row: the box is the tab's hit area and carries the underline at its foot. So a strip that opens a page starts 24px under the header hairline, and one under a section heading starts `--heading-gap` below it (rules 15 and 17; `tests/browser/section-census.ts` counts a `.tab` as a control). Its label is centred in the box, as a chip's is.
- An `ariaLabel` starts with what the tab shows (WCAG 2.5.3, label in name): the /gacha preview's skill tabs show "S1" and are named "S1: <skill name>" (they were "Skill 1: …", so "click S1" in voice control found nothing). Only letters and digits count, since a symbol is not spoken as drawn: the /dev/ui specimen's "6★" named "6-star" is right. `tabs.spec.ts` checks every tab of every strip it presses.
- `removable={{ onRemove, label }}` makes tabs removable (the planner's operators): Delete or Backspace on the focused tab removes it, and focus lands on the tab the page makes current once it re-renders (the planner's All), not on a neighbour at tabindex -1 that a screen reader announces "not selected"; the tab draws a × that does the same on a click. A tab may not hold a button, so the × is not one; `label(option)` names it ("Remove Amiya from plan") and returns `null` for a tab that stays (All). The × and Delete are shortcuts for a mouse and a keyboard only: the × is `aria-hidden` and Delete needs a keyboard, so a touch screen reader or voice control cannot reach either. **A page that makes tabs removable also renders a real button for it inside the panel** (the planner's dossier has "Remove from plan", a `.ghost .btn-sm`, focus going to All after it), and the ×'s hit area is 24px or more each way (`.tab-remove::before`, WCAG 2.5.8: the glyph is ~17x18 against the tab's own label). `tests/browser/tabs.spec.ts` fails without either.
- Switching must not shorten the page (rule 12). A page that swaps panels of different heights holds the reader's place in the handler: `useSwitchHold` (Schedule, events, the planner's operators), `useHeightFloor` on the panel (the enemy pane), a height floor inside a dialog (the `/gacha` preview's modules), or the page's own reserve (Stronghold, whose pinned bar still leaves the screen when a short section cannot carry it: the skill's documented limit). `tests/browser/tabs.spec.ts` presses every tab of every strip from the top of the screen and fails when the strip moves.
- **Links between routes** (the Terminal bar, the game switcher, an operator's class forms, a stage's forms on /stages/browse) take the same look as `<nav className="tabs">` of `<a className="tab" aria-current="page">`, not `role="tab"`: they navigate. The Terminal bar is packed from the frame's left edge like every strip. It is **one row or a menu, never two rows**: the seven tabs need 967px in Rajdhani, and the frame's content is 992px only from a 1040px window (975 with a 17px classic scrollbar), so under 1040px (not the site nav's 900) it collapses to one menu button, which is a control and so `var(--control-h)` tall (`row-alignment.spec.ts` measures it at 390 and 800, and with the token flipped). The row does not wrap, and a tab may be narrower than its label, which then ends in an ellipsis: the webfonts load with `display=swap`, and in the fallback face the row needs 1141px, so as a wrapping strip the bar was two rows (82px) on the first paint and every Terminal page jumped up 42px when Rajdhani arrived (CLS 0.4-0.8, against 0.04-0.11 now). `terminal-pages.spec.ts` loads /stages, /stages/supplies and /stages/all with Google Fonts refused and fails a second row, a bar that is not its 40px, a tab past the frame, or a row shown at 1039px. A wrapping strip is fine where the wrap is the layout on every paint (Stronghold's sections); a strip that only fits in the webfont needs the same treatment, or rows of its own: the game switcher wrapped where its labels ran out of room, so at 390 its "Stage" tab jumped 260px when Rajdhani arrived (CLS 0.24), and it is now three games and then two under 560px and its own line under 720px (rule 19).

### Headings (`shared.css`)

```tsx
<section className="op-section"><h2>Skills</h2>…</section>          {/* a section heading */}
<div className="front-home-panel"><h2 className="section-title">Events</h2>…</div>
<h3>Talents</h3>                                                       {/* a sub-section */}
<h2 className="entity-title">{enemy.name}</h2>                         {/* a name: 22px */}
<h3 className="entity-title entity-title-sm">{skill.name}</h3>         {/* under an 18px h2 */}
<h3 className="label-tag">Cookie supporters</h3>                       {/* a micro-label heading a group */}
```

- A dialog's `h2` (`.modal-box h2`) is the `.entity-title` voice without the class.
- Place headings with margins and layout only; the look is `shared.css`'s (rule 16).

### SegmentedControl and `.filter-chip`

Use SegmentedControl to pick one of N values: view modes, rarity, sort order, a level or stage. Panels that swap in place are Tabs (above).

```tsx
import SegmentedControl from '@/components/ui/SegmentedControl';

<SegmentedControl
  label="Rarity"
  value={rarity}
  onChange={setRarity}
  options={[
    { value: 'all', label: 'All' },
    { value: 6, label: '6★', ariaLabel: '6-star', count: 112 },
    { value: 5, label: '5★', ariaLabel: '5-star' },
  ]}
/>
```

- It renders a `role="group"` of `<button class="filter-chip" aria-pressed>`. Tests find each option with `getByRole('button', { name })`.
- The pinned chip is `var(--control-h)` tall (36px, 40px at ≤720), with a `--control-border` border, `var(--radius)` and the button voice (Rajdhani 600, 12px, uppercase, 0.09em). When picked it has a `--teal-dim` fill, teal text and a teal border.
- Chips are content width and the row packs from its start: the first chip's box starts on the section edge and its label 13px in (12px padding and the border). Never grow a chip to fill the line (rule 13); a row that needs to wrap wraps. A fixed-width icon tile (a 44px talent tile, a 40px "1x") is sized, not grown, and may centre its icon.
- **Never** use `cond ? 'primary' : 'ghost'` for a pick-one control or a toggle. `--teal-fill` is reserved for primary actions. `audit:styles` rejects the swap in TSX (`primaryToggle`, strict; `pages/dev` excepted). A button whose label says its state ("Play" / "Pause") keeps one class and takes no `aria-pressed`.
- `.tgl` (a mode switch in a dense toolbar, mono 11px) takes `.is-on` together with `aria-pressed`. On is the chip's picked state, not a fill. It is not for settings or options: those are `.check` checkboxes, and `audit:styles` (`tglOutsideToolbar`) rejects a `.tgl` in any file outside `TGL_SCOPE` (none today).
- For filters that toggle independently (tags you can turn on together), render `.filter-chip` buttons directly with `aria-pressed`. The picked state reads `aria-pressed`, `aria-selected` or `aria-checked` (`.active` also works during migration).
- Chip content can include `icon` (an 18px img or svg), `count`, and `ariaLabel` for icon-only chips.

### LIVE badge (`.badge-live`)

```tsx
{isLive && <span className="badge-live gacha-banner-sidebar-live-badge">Live now</span>}
```

- White mono caps (10px, 700, 0.08em) on `--danger-solid`, 16px tall with 5px side padding and `var(--radius)`. The text is written in any case; the class uppercases it.
- The page's own class only places it (`position: absolute; top; left`). It sets no font, background or colour (`audit:styles`, `liveBadge`). Twitch streams use it too: they were Twitch purple, a second look for the same meaning.
- It is `inline-flex` with a gap, so the next round's blinking dot (`::before`, with `prefers-reduced-motion: reduce` turning it off) sits beside the text without changing how the box is built. There is no dot and no animation yet.
- Uses: `/gacha` banner sidebar (LIVE NOW), `/schedule` events list (LIVE), `/stages/all` mode cards (RUNNING NOW), the world map tooltip (LIVE NOW), the home community fader and the `/community` stream cards (LIVE, LIVE NOW). The `/community` event list's status dot (`.event-status-live`) is a dot, not a badge, and stays.

### Checkbox (`.check`)

The control for a boolean or an option. A real checkbox inside its label, so the whole label is the hit area and a screen reader hears "checkbox, checked".

```tsx
<label className="check">
  <input type="checkbox" checked={monthlyCard} onChange={(e) => setMonthlyCard(e.target.checked)} />
  Monthly card
</label>

{/* A group of options */}
<div role="group" aria-label="Recurring income">{options.map((o) => <label key={o.key} className="check">…</label>)}</div>

{/* Visible text shorter than the name: aria-label on the input */}
<label className="check"><input type="checkbox" aria-label="Include past rewards in forecast" … />Include</label>
```

- The box is drawn (`appearance: none`) from the tokens: an 18px `--control-border` box on `--well` at rest, a teal border on hover, the site's 2px focus ring, and when checked a teal tick over `--teal-dim` (the chip's "on", never `--teal-fill`). `:indeterminate` draws a bar (the music guesser's select-all). Disabled is `--text-faint` text on an inert box.
- The label row is at least 32px tall and the text is Inter 13px in `--text`, turning teal on hover. A page may place and size the label (grid columns, padding, a smaller font, a card background like the stage guesser's list); it does not repaint the box, and no feature stylesheet styles `input[type=checkbox]`.
- Uses today: `/pulls` recurring income (five sources and Monthly card), Include past rewards (two places), Include sparking, Already cleared and the unclaimed-rewards list; `/recruitment` Prioritize 4★+ and Robots; the stage guesser's chapter and event list; the music guesser's Include CN, release list and category select-all.
- A toggle whose label says its state ("Craft" / "Crafting" in the planner) stays a button, and an independent filter stays a `.filter-chip` with `aria-pressed`; a setting or a list you tick is a checkbox.
- Pick-one groups are not checkboxes: they are `SegmentedControl` (the music guesser's clip start and the stage guesser's search mode were radios and are segmented controls).

### Buttons

| Class | Use |
|---|---|
| *(none)* on `<button>`, or `.btn` on a link | Secondary action: `--row-grad` with a `--control-border` border |
| `.primary` | The one action that matters on the screen: teal fill with `--teal-ink` text |
| `.ghost` | Tertiary actions and dense toolbars: transparent with a `--control-border` border |
| `.danger` | Destructive actions (Reset, Start over, Delete): red border and text |
| `.btn-sm` | The row size: `var(--control-h)` tall, 12px, padding 4/14. A base or `.primary` button beside other controls takes it. |
| `.btn-icon` | A square icon button at `var(--control-h)` both ways (a close "×", a month step, a play or remove glyph), on any variant: `btn-icon` (the button surface), `ghost btn-icon` (transparent). |
| `.btn-lg` | The unused large face (17px). |
| `.btn-bare` | A `<button>` that is **not** a button: a card, a tile, a list row, an album cover. The base button rules skip it entirely (no uppercase, no tracking, no weight, no inline-flex centring, no teal hover), so your own class supplies the look. A card without it inherits the button voice onto its own font: the Stronghold enemy and Isomorph rows rendered Inter 16 uppercase at 0.09em, the /gacha featured chips Inter 11 at 0.09em. `tests/browser/cards-and-headings.spec.ts` fails on any visible button computing Inter or JetBrains Mono with the 0.09em tracking, on every census address and state. Once your class boxes it in `--control-border` it is a control again, held to `var(--control-h)` in a row (rule 4: the row census and `controlHeight` both count it). |
| `.pick-card` | A selectable card (a preset, a banner). It has the quieter `--card-border` frame and a teal hover. When picked (`aria-pressed`, `aria-selected`, `aria-checked` or `.is-selected`) it has a teal border over `--teal-dim`. Use it with `.btn-bare`. |

**Four variants, two sizes.** The variants are base, `.primary`, `.ghost` and `.danger`. The sizes are the 44px call to action (base or `.primary` standing on its own: padding 12/24, 14px) and the control height (`var(--control-h)`), which `.ghost` and `.danger` always have and base or `.primary` take with `.btn-sm`. A primary beside a ghost takes the control size by itself (the sibling rule in `shared.css`). There are no one-off sizes: the planner's and the operator page's two-line MAX tiles, the /gacha dialog close (a 26px glyph in 40px), the support links (a 12px copy of `.btn` on a 4px radius), the stage list's 26px Clear and the 42px Stronghold launch buttons are all one of the eight now.

- **The documented exception:** the `/gacha` X1/X10/Reset pull row (`.gacha-action`, 42px, 15/700 at 0.05em) stays as it is, because `/gacha` is the reference page and its action row is part of what was chosen. `CONTROL_HEIGHT_EXEMPT` names it, with the few other controls that are not in a row (the Stronghold companion's compact kit, picture cards, the /base map's on-canvas buttons, menu rows). Tabs are not row controls and are not on the token: `.tab` is a label with an underline, no box (see Tabs).

```tsx
<button type="button" className="btn-bare album-tile" onClick={open}>…</button>
<button type="button" className="btn-bare pick-card" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>…</button>
<button type="button" className="danger" onClick={reset}>Reset base</button>
{/* In a row with a field: the row size, not the 44px call to action. */}
<SearchInput … /><button type="submit" className="primary btn-sm">Guess</button>
<button type="button" className="ghost btn-icon" aria-label="Close" onClick={close}>×</button>
```

Anchors: `<Link className="btn">`, `<Link className="btn primary">`, `className="ghost"` and `className="danger"` all take the button look.

### StyledSelect

This is the only dropdown. It replaces the native `<select>`, `gm-pickbtn`, `stage-picker-btn`, `PlannerSelect`, `cal-pick-btn` and `ContentPicker` (the enemy pages' picker, which is inside `components/ui` but is a duplicate to fold into this one).

```tsx
import StyledSelect from '@/components/ui/StyledSelect';

<StyledSelect
  label="Filter by faction"          // required accessible name
  value={faction}
  onChange={setFaction}
  placeholder="All factions"         // shown when value matches no option
  options={[
    { value: '', label: 'All factions' },
    { value: 'rhodes', label: 'Rhodes Island', group: 'Terra' },
    { value: 'kjerag', label: 'Kjerag', group: 'Terra', disabled: true },
  ]}
/>
```

The options are generic. Extend `SelectOption` with your own fields and draw them with the render slots:

```tsx
type AllianceOption = SelectOption & { icon: string; n: number };

<StyledSelect<AllianceOption>
  label="Alliance"
  value={alliance}
  onChange={setAlliance}
  options={alliances}
  renderOption={(o, { selected }) => <><img src={o.icon} alt="" width={20} height={20} /><span>{o.label}</span><span className="count">{o.n}</span></>}
  renderValue={(o) => <><img src={o.icon} alt="" width={18} height={18} />{o.label}</>}
/>
```

- The trigger is `var(--control-h)` tall, like every control in a row; `size="title"` is the heading-sized trigger (22px Rajdhani uppercase, no fill, the same height), used for the calendar's month and year between the two `.ghost .btn-icon` month steps. A title trigger shows its whole value: on a phone the month gets what the two steps and the year leave (105px at 390, 75 at 360, against 109 for SEPTEMBER), so the month takes `renderValue={renderMonthValue}` (`components/schedule/CalendarMonthValue.tsx`), which shows the first three letters at 440px and under and keeps the full name for a screen reader. `row-alignment.spec.ts` picks every month at 360, 390, 460 and 1440 and fails a value wider than its trigger's box.
- `align="end"` right-aligns a menu wider than its trigger. The default is `start`.
- `menuMinWidth` defaults to 240.
- `disabled` disables the control, and so does an empty options list.
- Groups: consecutive options with the same `group` are drawn under one heading, in order.
- Rows are at least 40px tall. The selected row has teal text on `--teal-dim` with a check mark.
- Keyboard: Enter, Space, the arrow keys or Alt+ArrowDown open the list. The arrow keys move, Home and End jump to the ends, PageUp and PageDown move ten rows, Enter, Space or Alt+ArrowUp choose, Escape and Tab close, and typing finds a row by its label (repeating a letter cycles through the matches). Disabled rows are skipped.
- The render slots are optional on purpose. They are presentation, and plain text rows are the right default. The house rule that new information must be a required prop applies to behaviour, not to slots.

### SearchInput and SuggestMenu

This is the only text search field. With `suggestions` it becomes a combobox with a list on StyledSelect's surface.

```tsx
import SearchInput from '@/components/ui/SearchInput';

// Plain filter box
<SearchInput label="Search operators" value={q} onChange={setQ} placeholder="Search by name…" />

// Autocomplete: every suggestion prop is required together
<SearchInput
  label="Guess an operator"
  value={q}
  onChange={setQ}
  suggestions={matches}
  getKey={(op) => op.name}
  renderSuggestion={(op) => <><img src={icon(op)} alt="" width={32} height={32} /><span>{op.name}</span></>}
  onPick={(op) => guess(op.name)}
  suggestLabel="Matching operators"
  emptyText="No operators found."    // optional
  upward                             // optional: open above, for a field low on a phone
/>
```

- Keys: ArrowUp and ArrowDown move the highlight while focus stays in the field. Enter picks the highlighted row, or the only row when exactly one matches. Escape closes the list, and a second Escape clears the field.
- The field is `.search-input` (`var(--control-h)` tall, `--well` ground, `--control-border`, mono 13px, 16px at ≤720 so iOS does not zoom) with a magnifier and a clear button.
- The list is absolutely positioned inside the field's wrapper, so it never adds to the page height.
- `SuggestMenu` is exported for the rare field that cannot be a `SearchInput`. Import it rather than drawing a list.

### ScrollRow

Use it for a row of cards that cannot wrap, such as the home skins row or the `/music/discover` rows.

```tsx
import ScrollRow from '@/components/ui/ScrollRow';

<ScrollRow label="Skins on sale">
  {skins.map((s) => <SkinCard key={s.id} skin={s} />)}
</ScrollRow>
```

- It renders a flex line (children never shrink, 12px gap) with `overflow-x: auto` and the drawn `.sidescroll` bar: 10px, space reserved, `--text-faint` thumb, teal on hover.
- When the content overflows, the row becomes a named, focusable region, so the keyboard can scroll it.
- `controls` adds a previous/next pair of ghost buttons under the row's right end, for a row that is a page's main content (the `/skins` "Available now" shelf): a wheel-only mouse and iOS, which shows no drawn bar, get a way along it. Each scrolls by most of the row's width and is disabled at its end; the pair keeps its space (hidden) while the row fits, so it never changes the page height.
- No auto-scroll or marquee. The home marquee becomes a ScrollRow.
- A small fixed set should wrap instead (`.no-scroll-wrap`).
- Any other horizontally scrolling box gets `class="sidescroll"` plus its own `overflow-x`.
- The Stronghold companion keeps `components/gamemodes/CompanionScrollRow`, a drawn JS rail, because iOS ignores `::-webkit-scrollbar` and the companion is used on phones.

### Rarity

```tsx
import Rarity, { rarityLevel } from '@/components/ui/Rarity';

<Rarity n={rarityLevel(op.rarity)} />                // "6★" in --rarity-6
<Rarity n={6} format="stars" />                      // "★★★★★★"
```

- For a portrait tile, add `className={`tier-${n}`}`, a 3px bottom edge in the rarity colour.
- For a full colour block, use `tier-fill-${n}`, the rarity surface behind near-black ink.
- For custom CSS, use `color-mix(in srgb, var(--rarity-5) 15%, transparent)` for a tint. Never a hex.
- `rarityLevel()` throws on a value outside 1–6, because that is a data error.

### useHeightFloor

This is the Anti-Page Jump fix for one container whose content can shrink: a tab switch, "show less", closing a panel.

```tsx
import { useHeightFloor } from '@/components/ui/useHeightFloor';

const floor = useHeightFloor(eventSlug);           // the logical page, not the tab
<div ref={floor.ref}>{tabContent}{floor.spacer}</div>
```

It reserves exactly what the reader's position needs and gives the space back as they scroll up. Verify each use with the `apj()` probe: `anchorMovedPx` must be below 4 at 1440 and 390. Do not use it for a search that narrows a long list (see the skill).

### useSwitchHold

The same rule for a tab switch or a view swap, taken in the handler instead of after the change. It works out how tall the container must stay for the document to still reach the bottom of the reader's screen and applies that as the container's `min-height` in the same render as the new panel, so there is never a frame to clamp; it melts as the reader scrolls back up.

```tsx
import { useSwitchHold } from '@/components/ui/useSwitchHold';

const hold = useSwitchHold(pageKey);                        // the logical page: an event, a route
const choose = (next) => { hold.capture(); setView(next); };  // capture BEFORE the change
<div ref={hold.ref} style={hold.style}>{panels}</div>
```

Used by `/events/[slug]` (sections and reward stores), `/schedule` (Events / Calendar: the calendar is shorter, and the switch clamped the reader 51px up at 1440) /recruitment's Calculator / Guarantee cheat sheet (the calculator is half the cheat sheet's height: 143px at 1440; the page's own copy only, since the pop-out window scrolls on its own), the planner's Simple / Experimental (98px at 1440, 88 at 390) and the planner's per-operator tabs (an operator's dossier is taller than All materials; a 249px clamp on a phone was seen in one run and did not reproduce, so the hold there is the pattern rather than a measured fix). `capture()` counts the margins that collapse through the container's top and bottom edges as part of what the switch takes away: the page counts them and the container's box does not, and the planner's Experimental panel opens with a 16px margin that Simple does not have, so the hold for Experimental -> Simple came out 16px short on a phone (`tabs.spec.ts`). A panel that scrolls inside a dialog cannot use it (it measures the document); the `/gacha` preview's module panel holds its tallest height per operator instead.

### Error pages

`pages/404.tsx` and `pages/500.tsx` use `PageHeader` in the site frame on `--bg` in both themes. They are static on purpose.

## The ratchets: what is left

Two checked-in baselines listed the offenders while the page families migrated. CI fails on a **new** offender and also on a **stale** one: a fixed case must be removed from its baseline so that it cannot come back. Since the families landed (2026-09-25) most lists are empty, and an empty one is **strict**: it takes no entry, and regenerating the baseline refuses to add one.

What still carries accepted cases, all in `scripts/audits/style-audit-baseline.json`:

- `nativeControls` (3): the Stronghold companion's two language pickers (`StrongholdCompanion.tsx`, `role="listbox"`; the companion runs in a Document Picture-in-Picture window and `StyledSelect` portals its menu to the main document) and the development-only `pages/dev/index.tsx` `<select>`.
- `collisions` (20) and `fontSizes` (21): scoped descendant rules the audit's heuristic flags, and deliberate sizes (16px iOS no-zoom inputs, the 88px tutorial emoji).

### 1. `scripts/audits/style-audit-baseline.json` (`npm run audit:styles`, a Check step)

| Key | What it lists | What to do |
|---|---|---|
| `nativeControls` | `<select>` and `role="listbox"` outside `components/ui`, per file | Replace with `StyledSelect` (or `SearchInput` for suggestion lists) |
| `rarityLiteral` (strict) | Colour literals in rarity, star and pull rules, and in any custom property named for rarity | Use `var(--rarity-N)`, `.rarity-N`, `.tier-N` or `.tier-fill-N` |
| `oldTeal` (strict) | `#4de8d1` / `rgb(77 232 209)` | Use `var(--teal)` (pass it through CSS, or `currentColor`) |
| `pills` (strict) | 999px radii, and 50% radii on anything but an avatar, a dot, an image or a slider thumb (`ROUND_OK`, `ROUND_EXEMPT`), and on any control, `.btn-icon` included (`roundControl`) | Use a radius token |
| `h1Rules` (strict) | h1 size or case rules outside `shared.css` | Delete them and render `PageHeader` |
| `fontWeights` (strict) | Rules asking a font for a weight it does not load | Load the weight in `_document`, or use a loaded one |
| `collisions` | A bare class styled in two global stylesheets | Scope the class to its page, or move a shared one to `core/` |
| `fontSizes` | Sizes off the scale (9–13 body; 15/18/22/26/30 display) | Round to the scale |
| `rawHex` (strict) | A hex literal that a token names | Use the token |
| `scrollbarThumb` (strict) | A scrollbar thumb in `--line` or `--line-soft`, as `scrollbar-color`'s first colour or a `::-webkit-scrollbar-thumb` background | Drop the override and inherit `:root`'s `--text-faint` |
| `primaryToggle` (strict) | A TSX class chosen between `'primary'` and `'ghost'` by a condition, outside `pages/dev` | A `.filter-chip` with `aria-pressed`, or one constant class when the label carries the state |
| `checkboxPrimitive` (strict) | An `<input type="checkbox">` in TSX whose nearest open `<label>` has no `check` class | Wrap it in `<label className="check">` and delete any page styling of the box |
| `tglOutsideToolbar` (strict) | A `tgl` class in TSX outside the files in `TGL_SCOPE` (none today) | A setting or an option is a `.check` checkbox; a pick-one is `SegmentedControl`; an independent filter is a `.filter-chip` with `aria-pressed` |
| `stretchedChoices` (strict) | A tab or pick-one row stretched across its line: `flex: 1` / `flex-grow` on a `.filter-chip`, `.tab`, `[role=tab]` or a child of a choice row, or `justify-content: center` / `space-*` / `stretch` or equal `fr` columns on the row. A choice row is `.seg-control`, `.tabs`, `[role=tablist]`, a `*-tabs` / `*Tabs` class, a className given to `SegmentedControl` or `Tabs`, or an element holding two or more chips | Content width, packed from the start (rule 13); a genuine exception goes in `STRETCH_ALLOWED` in `scripts/audits/audit-choices-badges.mjs` with its reason |
| `deadPrimitives` (strict) | A class defined in `styles/core/arkpedia-theme.css` that no string in `pages` (dev pages excluded), `components` or `lib` names; `tier-${n}` counts for every `.tier-N` | Delete the rule. Documented API that nothing renders yet is `PRIMITIVE_KEEP`, with its reason (`.btn-lg`, `.tgl` and its states, `.is-selected`, `.no-scroll-wrap`, `.tier-fill-N`) |
| `liveBadge` (strict) | A font, background or colour on a live-badge class (containing `live-badge` or `live-now-badge`, or ending in `-live`) outside `arkpedia-theme.css`, or an element whose text is LIVE / LIVE NOW / RUNNING NOW without the `badge-live` class | Render `.badge-live` and keep only the badge's position in the page (rule 14). `LIVE_ALLOWED` lists the non-badge matches (`.event-status-live`, a dot) |
| `controlHeight` (strict) | A literal `height` / `min-height` on a control: outside `styles/core`, any rule whose subject is a button, text input, select or textarea, a primitive class, or a class TSX puts on one (not a `.btn-bare`, never a dot), and a class TSX puts on a `.btn-bare` button that a rule boxes in `--control-border` at rest, at a height a row control could have (20-56px); a textarea (the element, or a class TSX puts on a `<textarea>`) only at such a height too, since a multi-line field is taller than any row; inside `styles/core`, a primitive class. `CONTROL_HEIGHT_EXEMPT` lists the few that are not row controls, each with its reason, and fails on a stale entry | Read `var(--control-h)` (or take `.btn-sm` / `.btn-icon`) and delete the page's height |
| `headingRules` (strict) | Heading paint (`font-size`, `font`, `color`, `letter-spacing`, `text-transform`) on an h2 or h3 subject -- the element, or a class the TSX puts on an `<h2>`/`<h3>` -- outside `shared.css`, unless the subject carries `.entity-title` (which may not exceed 22px) or `.label-tag`; `HEADING_EXEMPT` names the Stronghold companion's pop-out headings | Use `.op-section h2` / `.section-title`, the global `h3`, `.entity-title` or `.label-tag` (rule 16), and keep only margins and layout in the page |
| `tealDecoration` (strict) | `var(--teal)`, `--teal-dim` or `--teal-fill` as a colour, background, border, outline or shadow on a selector with no state in it (`:hover`, `:focus`, `:checked`, `[aria-pressed]`, `[aria-current]`, `.current`, `.live`, `.open`...), in the folders of `TEAL_DECORATION_SCOPE` (`styles/stages/`) | Recolour it (`--text-dim`, `--heading` for a heading), or qualify the selector with the state it marks |

```sh
npm run audit:styles                 # check
npm run audit:styles -- --update     # after a fix: tighten (review the diff, it must only shrink)
```

The audit sees only what CSS and TSX text show. A weight on a rule that inherits its family, or an `<h1 className={styles.x}>`, is invisible to it. The browser test and the rig measure the rendered result.

### 2. `tests/browser/page-bounds-baseline.json` (`tests/browser/page-bounds.spec.ts`, in `npm run test:browser`)

For every page at 1440 and 390, the test measures:

- `no-h1`: the page has no h1 (a visually hidden one is fine).
- `h1-align`: the visible h1's left edge is not where the content starts.
- `frame`: content lies outside 224–1216 at 1440, or outside 24–366 at 390.
- `page-scroll-x`: the page itself scrolls sideways.
- `tab-align`: a tab strip or pick-one row that leads its line (`[role=tablist]`, `.tabs`, `.seg-control`, a `*-tabs` class, or a row of two or more chips) has its first item off the section's edge by more than 2px (the edges are the nearest heading's text-left in the same column, the content edge of the section, dialog or panel it is in, the block on the line above it, and the frame), or grows an item wider than its content (flex-grow, or equal `fr` columns); and any visible `.tab` that draws a box (side padding, a border or a fill: a page rule restyling the tabs). Measured in the dark theme and again in the light one (`tests/browser/tab-align.ts`, rule 13). A row placed beside something on its line (the map tools beside MAP, a sort row at the end of a toolbar) is not measured.

- `first-gap`: the first content in `main` is not 24px (±2) under the header hairline. A Terminal scene at 700px and under expects 14px and the operator page 16px (rule 15); both are named in the spec.
- `motion`: an animation that moves content (keyframes on transform, translate, scale, rotate or an inset) exists under `prefers-reduced-motion: reduce`. The pages are measured with reduced motion so nothing is caught mid-flight, and the reader who asked for it gets none. A page's reduced-motion override belongs in the same file as the animation, after it: the one for the roster cards sat in `shared.css`, lost the cascade to `roster.css`, and the cards rose 24px in anyway (first-gap read 26.5px under load).

It also runs `stack-align` (rule 17) against its own baseline, `tests/browser/stack-align-baseline.json`: the picture cards whose text keeps `--card-inset`, each accepted only at that inset (an entry that shows only on some days, a card in a date window or a stage open by weekday, is marked `optional` and escapes only the stale check). A driven state the route list never shows, the planner's operator dossier, is checked at both widths too. Every other first line set 3-120px in from its parent's edge fails, and an accepted entry no page shows any more fails as stale. `tests/browser/section-census.ts` does the measuring (it also serves the heading and section checks in `cards-and-headings.spec.ts`) and says what it leaves out: content centred or end-aligned across the section (a control centred alone in a small cell is still an indent), a tile that centres an icon over its label, content out of flow, inline runs; a row boxed by its state (the selected stage row, the playing voice line) is measured by its content, a disclosure marker or generated glyph leads its element, and a list's markers sit in its 1.1em column. When no child starts on the parent's edge, the leftmost child is the edge, so two siblings that disagree (the operator panel's header and reading area) fail too. A card inset is checked by its content box, not its first glyph.

The baseline is `{}` and the test is strict: every measured page passes at both widths, so any offence fails, and `UPDATE_BOUNDS_BASELINE=1` measures every page but refuses to write a non-empty baseline. Fix the page.

The test also fails when a page file under `pages/` is neither measured nor excluded with a reason (dynamic pages need a sample address in `SAMPLES`). It also checks that the 404 page renders on `--bg` in both themes.

## Migrating a page family: checklist

1. Replace the page's own header markup with `<PageHeader>` as a sibling of `<main>`. Delete the page's h1, eyebrow and header CSS.
2. Drop `main-wide`, per-feature gutters and fixed-width columns. Content fills `main` (992px at 1440) and uses `var(--page-gutter)`.
3. Section headings: `.op-section` plus `<h2>` (`--heading`, 18px) for sections and the global `h3` for sub-sections. Delete page-level heading colours, sizes and teal headings.
4. Controls:
   - panels that swap in place become `Tabs` (links between routes take `.tabs` / `.tab` with `aria-current`)
   - pick-one groups become `SegmentedControl`, at content width
   - booleans and options (settings, lists you tick) are `.check` checkboxes, never chips or `.tgl`
   - independent filters become `.filter-chip` with `aria-pressed`
   - dropdowns become `StyledSelect`
   - search fields become `SearchInput`
   - cards that are buttons get `.btn-bare`, plus `.pick-card` if they are selectable
   - destructive actions get `.danger`
   - a base or primary button in a row of controls gets `.btn-sm`; a square icon button gets `.btn-icon`
   - delete the module or page-local variants, and every height the page states on a control (rule 4)
4b. Headings and rhythm: section headings are `.op-section h2` (or `.section-title`), names `.entity-title`, micro-labels `.label-tag`; a heading row carries `margin-bottom: var(--heading-gap)`, stacked sections are `--section-gap` apart, and a picture card's text keeps `--card-inset` (rules 15-17).
5. Borders on anything interactive use `var(--control-border)`, with hover to teal; a large pressable surface (a row card, a `.pick-card`) uses `var(--card-border)`; picture and content cards use a transparent border instead, teal on hover and focus. Passive frames keep `--line` or `--line-soft`. Cells in a row share one centre line (rule 4).
6. Replace rarity with `<Rarity>` or `.tier-N`. Categories use `--cat-*`. Replace any remaining literal colours with tokens (check the light theme).
7. Radii come from tokens only (2, 3 or 4px).
8. Horizontal rows use `ScrollRow` or `.sidescroll`. Nested vertical scrollers keep the default thumb. Put focus rings inside scrollers with `outline-offset: -2px`.
9. Hide "Coming soon" placeholders until they have content.
10. Density changes must obey the Anti-Page Jump rule. Measure them with `apj()`.
11. Run `npm run audit:styles` and the page-bounds test. If a remaining ratchet list shrank, tighten it with `npm run audit:styles -- --update` and commit the smaller baseline with the change.
12. Verify the rendered result at 1440 and 390, dark and light (the rig, or screenshots). A green build is not verification.
