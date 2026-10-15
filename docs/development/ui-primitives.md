# UI primitives and tokens

This is the reference for building or migrating any Arkpedia page. It covers the design tokens, the shared components in `components/ui`, the global rules, and the style audit and page-bounds checks that hold every page to them. Follow it literally. When a page needs something this page does not cover, add it here and to the primitives. Do not solve it inside the page.

The canonical style is the `/operators` list page plus `/gacha`, as decided on 2026-09-25:

- Section headings are `.op-section h2` in `--heading`, a teal-ish colour kept apart from the `--teal` that marks on/current states (maintainer, 2026-09-26; amber was tried and rejected).
- Picture and content cards (posters, banner art and thumbnails, operator and skin tiles, enemy tiles, album covers, portraits, video cards, the Terminal's stage, mode, supply and Regular Tasks cards, the /games and /community cards) carry **no resting border**, and no frame round the art inside them either: the art says they can be clicked. They keep a transparent 1px border so nothing shifts, and draw the teal edge on hover and keyboard focus (`border: 1px solid transparent`, `border-color: var(--teal)` on `:hover` and `:focus-visible`), and nothing shows through that border at rest: a card (or a box round its art) whose art fills its padding box clips its own background to it (`background-clip: padding-box`), or its fill draws a 1px ring round the art -- /gacha's banner cards had a grey one on the light sidebar (231 on 251), and twelve other picture cards the same (maintainer, 2026-09-28). A card in an on state keeps its teal edge, and a rarity ring is data, not a frame. Only real controls (buttons, chips, checkboxes, inputs, tabs, dropdowns) carry `--control-border` at rest, and large pressable surfaces (a selectable `.pick-card`, a row card like the pull planner's banner cell) carry the quieter `--card-border`; a control with only a small picture in it (a featured-operator chip, an appearance thumbnail, a banner in /pulls' Add banner list) is one of them. A `.pick-card` whose main content is a picture is a picture card, not one of them: it takes `.pick-card-picture` (the /pulls skin wishlist's outfits, 2026-09-28). `tests/browser/cards-and-headings.spec.ts` finds every link or button whose main content is a picture (40x40 or more, half its box or more) on twenty routes and the opened skin wishlist, and fails on a framed one, a ring included.
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
| Every new transition and animation (rule 23) | `styles/core/motion.css`, all inside `@media (prefers-reduced-motion: no-preference)`, imported last (the older ones are `MOTION_LEGACY` in `scripts/audits/audit-motion.mjs`) |
| React primitives | `components/ui/*` |
| Loaded webfont weights | `pages/_document.tsx` (Google Fonts URL) |

The global stylesheets load before every feature stylesheet (`pages/_app.tsx`). At equal specificity a feature rule therefore beats a primitive. That is how pages have been overriding the primitives, and migrating a page mostly means deleting those overrides.

CSS modules are used by the operator page, the games, the pulls workspace and `StyledSelect`. A module may style its own layout. It must not restate a primitive's paint: colours, borders, radii, button voice or heading sizes.

## The rules

1. **Teal means "on" or "current", and nothing else.** Selected chips, the current tab, the active nav item, a checked checkbox, a focused control and hover all use teal. Headings, resting links, decoration, rarity and categories must not be teal. "On" has one look everywhere: the `--teal-dim` fill with teal border and text (`.filter-chip[aria-pressed="true"]`, `.tgl.is-on`, `.pick-card` when picked), and for a checkbox a teal tick on the same `--teal-dim` box. The solid `--teal-fill` is `.primary`'s and never marks a state; `tests/browser/on-states.spec.ts` fails when a pressed, checked or `.is-on` control computes that fill, and when a checked checkbox is not the `.check` box (teal border on `--teal-dim`).
   - **One deliberate exception:** the automatic skill metric ("SP recovery: Auto", "Activation: Auto") is teal-bordered on `--teal-dim` on the operator page (`.skillMetricAuto` in `OperatorPage.module.css`) and in the `/gacha` operator preview (`.gacha-preview-skill-fact.auto` in `gacha.css`). The maintainer chose this in main's 2026-09-25 commit "Align gacha rarity borders and skill recovery colors", and it stays. Two older teal surfaces also stay, each with its own meaning: `.enemy-resist.vulnerable` on `/enemies` (a weakness, not a state) and the `/gacha` X1 button (the reference page, left as it is). Those are the only non-state teal surfaces. `audit:styles` (`tealDecoration`, strict) rejects teal on a selector that names no state in the page families already clean of it, today `styles/stages/`; elsewhere reviewing new ones is left to people, so keep this list in step with the code and add a family's folder to `TEAL_DECORATION_SCOPE` in `scripts/audits/audit-styles.mjs` once it is clean.
2. **One resting boundary for controls, and it is soft.** Anything that can be pressed, typed in, ticked or picked from has a `--control-border` border at rest, except a picture or content card, which has none (above). The border is a band, not WCAG 1.4.11's 3:1: at 3.5:1 every chip and field was a hard outline (maintainer, 2026-09-26: "too harsh"). A control reads as one through its fill (`--row-grad`, `--panel-2`, `--well`), its label or button voice, and the teal hover and focus; the border only has to be seen. A large pressable surface (a `.pick-card`, a row card, a tall disclosure row) takes the quieter `--card-border`, because a long outline at the chip's weight boxes in half the page. A `.pick-card` that is a picture card takes `.pick-card-picture` and rests with no border at all (above): the /pulls skin wishlist's outfit tiles do (maintainer, 2026-09-28). The other `.pick-card`s keep `--card-border`, each for its reason: the base setup's presets and the operator guesser's themes are text; the stage guesser's tile legend is a name beside a 28px swatch; /pulls' Add banner list is a name, a banner and dates beside two 68px operator icons, the /gacha featured-operator chip's kind; and the operator page's outfit thumbnails are a carousel's selector strip (68x46 art in an 86x90 tile, under its arrows, dots and play), decided in 9bd39a1. `--line` and `--line-soft` are for passive hairlines only (panels, dividers, table rules).
3. **Booleans and options are checkboxes.** A setting that is on or off ("Monthly card", "Include CN", "Include sparking") and an item in a list you tick (the stage guesser's chapters, the music guesser's releases) is a real `<input type="checkbox">` in a `<label className="check">`. It is never a `.tgl`, a `.filter-chip` with `aria-pressed` or a button drawing its own tick box: #64 turned eleven of them into highlighted buttons and the maintainer asked for the checkboxes back. `.tgl` is only a mode switch in a dense toolbar. `audit:styles` rejects a checkbox outside a `.check` label (`checkboxPrimitive`) and a `.tgl` outside `TGL_SCOPE` (`tglOutsideToolbar`), and `tests/browser/checkboxes.spec.ts` holds the known option groups to real checkboxes.
4. **One line, one height.** The cells of a row share one centre line: a button, input or select and the text or the other control beside it sit on the same vertical centre (and on one baseline where text sits beside text). A caption under a value hangs below it out of the flow rather than lifting the value off the centre, and a margin under one cell of a centred row belongs to the row, not the cell (`.hint` has no outer margin for this reason: its 18px lifted the /skins count 9px). The controls in a row are **one height, `var(--control-h)`**: chips, `.tgl`, `.ghost`, `.danger`, `.btn-sm`, `.btn-icon`, `.btn-x` (the × square), the search field, the StyledSelect trigger, and number inputs all read it as a min-height with small vertical padding, so the token decides the height whatever the font. A base or `.primary` button is 44px only as a standalone call to action; in a row it takes `.btn-sm` (see Buttons). No page states a control height of its own: `audit:styles` (`controlHeight`, strict) rejects a literal `height` or `min-height` on a control outside `styles/core` and on a primitive inside it. A `.btn-bare` button is a card, a tile or a tab until it draws a control's box: one bordered in `--control-border` (rule 2) is a control like any other (the /music queue's track title was a bordered bare button at a literal 36px beside 40px icon buttons on a phone, and both checks left every `.btn-bare` out). `tests/browser/row-census.ts` measures every flex row and grid, counting a bare button boxed on all four sides as a control (centres within 2px, control heights within 1px, and in a grid no control wider than the columns it spans: a column sized for the old 32px button held the 36/40px one and ran it into the gap, so a column that holds a control reads `var(--control-h)` too) and `tests/browser/row-alignment.spec.ts` runs it strict on every address and driven state the census visited, at 1440 and 390 (the site nav, the same fixed bar on every page, is measured once, in its own test), with a reasoned `ALLOWED` list that fails when an entry goes stale; the same spec flips `--control-h-base` to 32px and checks that every primitive follows. A line of text beside a control is put on the control's centre by its own offset, not by making every item control-height: the operator page's meta (stars, class, branch) is 20px lines starting `(var(--control-h) - 20px) / 2` down beside the section menu, since as control-height cells the two-line meta made the panel header, which is sticky on a phone, 151px against 127 (141 against 121 at 1440); `row-alignment.spec.ts` holds it to those ceilings. In a grid of fields, a field whose label wraps keeps its box on its neighbours' line: each cell fills the row, label at the top and box at the bottom (the /pulls wallet's "Originite Prime" wrapped at 360 and put its box 3px under Orundum's; `tests/browser/pulls-wallet.spec.ts`). A row that grows with the token pays from its spacing, not from its text: on a phone the /music queue's three 40px icon buttons sit 2px apart in a row with 4px gaps and an 8px title inset, so each title keeps the 153px for its text it had beside 32px buttons (`row-alignment.spec.ts`, 390 on a touch screen).
5. **One hover rule.** On hover, the border and the text go to `--teal`. Destructive `.danger` controls are the exception: they stay red, and so are tabs: a tab has no border, and a hovered tab in teal would read as the current one, so its label goes from `--text-dim` to `--text`. So is the × that closes or removes (rule 21): it has no border either, so it goes from `--text-dim` to `--text` over a faint fill of that ink, which shows its hit area.
6. **Rarity colour comes only from `--rarity-N`**, through `<Rarity>`, `.rarity-N`, `.tier-N` or `.tier-fill-N`. 5★ is never teal.
7. **One frame.** The header, `main` and the nav share `--frame-max` (1040px) and `--page-gutter` (24px at every width). There are no per-feature gutters and no `main-wide`.
8. **One page header**, `<PageHeader>`, placed as a sibling of `<main>`. Its `compact` variant keeps tool actions beside the title, with the eyebrow above both, to leave more of the first viewport for content.
9. **One dropdown**, `<StyledSelect>`. Never write a native `<select>` or a hand-built `role="listbox"` outside `components/ui`.
10. **Radii come from tokens**: `var(--radius)` (2px) by default, `var(--radius-frame)` (3px) for an outer frame or a floating menu, and `var(--radius-control)` (4px) at most for a tile-like control. Never use a literal, never 999px pills, and never a 50% circle except on an avatar, a dot, an image or a slider thumb (the calendar's month steps and three help or close buttons were circles). A control is never round, whatever its name says: `.btn-icon` names the glyph it holds, not a picture. `audit:styles` (`pills`) rejects both, and never lets a button, a class naming one (`btn`, `button`) or a control primitive pass as a picture; `ROUND_EXEMPT` in `scripts/audits/audit-styles.mjs` names the four round things whose selectors do not say so.
11. **Only loaded font weights.** Rajdhani 500/600/700, JetBrains Mono 400–700 and Inter 400–700 are loaded. Any other weight is faked by the browser as faux bold.
12. **Anti-Page Jump.** No state change may leave the document shorter than the reader's scroll position needs. See the `arkpedia-ui` skill. `components/ui/useHeightFloor` is the general-purpose fix, and `components/ui/useSwitchHold` the one for a tab switch or a view swap. `tests/browser/tabs.spec.ts` puts each strip at the top of the screen before every press, not once: placed once on the short panel, the press back from the tall one started with nothing to lose, and /recruitment's Cheat sheet -> Calculator (143px at 1440) and the planner's Experimental -> Simple (98px) clamped the reader and passed.
13. **Tabs and pick-one rows start on the section edge.** A strip of tabs is `<Tabs>` (or `.tabs` / `.tab` links between routes), and a pick-one row is `SegmentedControl`: both at content width, packed from the start of the line. The first tab's label, and the first chip's box, start where the section heading's text starts (or on the page frame, or on the panel's content edge). Nothing stretches them: no `flex: 1` on an item, no `justify-content: center` or `space-*` on the row, no equal `1fr` columns. A stretched chip centres its label, and the maintainer's mock put the first label ~30px right of the heading that way (2026-09-26); the r9 census found the site doing it on /operators/Amiya's voice lines (+29.8px), /recruitment (+45.6), the calendar layers (+62.5), the map tools (+49.6), the music guesser (+23.9), and the Terminal bar centred +26.9 off the frame. Equal cells are allowed only where they are the point, each with its reason in `STRETCH_ALLOWED` (`scripts/audits/audit-choices-badges.mjs`): the /stages/supplies week, the planner state form's E0/E1/E2, the music guesser's clip-length scale, the operator guesser's hint checklist, the music player's transport. `audit:styles` (`stretchedChoices`) rejects the CSS, and `tests/browser/tab-align.ts` measures the rendered page (the `tab-align` offence in page-bounds, on every route at 1440 and 390 in both themes, and `tests/browser/tabs.spec.ts` on the driven states).
14. **One live badge.** LIVE, LIVE NOW and RUNNING NOW are `<span className="badge-live">`: white mono caps on `--danger-solid`, 16px tall, one padding. A page places it (position, top, left) and paints nothing: the census found four looks for it (mono 9/700, Inter 10/700, teal on `--teal-dim` on /stages/all, the map's `.badge-tradeable`) and the primitive unused. `audit:styles` (`liveBadge`) rejects a font, background or colour on a live-badge class outside `arkpedia-theme.css`, and a LIVE text rendered without the class. Its twin for what has not opened yet is `.badge-upcoming` ("Starts in 3d 4h" on the home page's banners): the same box on `--amber-solid`, without the dot, which means live. Art the image repository has not published yet is `.art-placeholder`: the `--panel-2` frame the art will fill, saying "No art yet" in `--text-faint` mono (/gacha's banner, the home page's banner poster and thumbnails), never a bare initial.
<!-- r9 headings-spacing: rules 15-17 -->
15. **One vertical rhythm, in two tokens.** A section heading sits `--heading-gap` (14px) above the first content under it, and stacked sections are `--section-gap` (36px) apart; the first content of every page starts 24px under the header hairline (`main`'s padding). `.op-section h2` has no top margin (it inherited the global h2's 18px, which put a page that opened with a section heading at 42px), and a heading row (a flex row holding the heading and a count or a button) carries `margin-bottom: var(--heading-gap)` itself. A flex or grid gap that sits between a heading and its content is part of that gap (`calc(var(--heading-gap) - <gap>)`, as `/music`'s queue and `/techniques`' umbrellas do). The 2026-09-26 census measured 12 heading gaps (0-30px) and 11 section gaps (0-44px). Deliberate others, each measured by what it is rather than listed by page: a disclosure header whose body hangs from it on a shared edge (`/farming`'s tiers, 0px); a board of boxed panels in a grid, which keeps its grid gap (the Terminal home and the home page, 14px). Folded to one column, the Terminal home is a column of sections (under 900px, `--section-gap`, as `/pulls`' and `/recruitment`'s boxed sections are on a phone); the home page's panels are not sections and keep their 14px there (`terminal-pages.spec.ts` measures the Terminal home at 1440, 900 and 390, and the section census holds the folded column to 36px with every other); the music guesser's category rows (a hairline list); the slim Terminal pages at 700px and under (14px to the first content) and the operator page (16px, a workspace bounded to the viewport). `tests/browser/cards-and-headings.spec.ts` checks every section heading on 41 routes (14px ±2 below, 36px ±2 between stacked `.op-section`s) and `tests/browser/page-bounds.spec.ts` the first line of every page (`first-gap`, 24px ±2), on each page load and after every driven state in `census-routes.ts`: a view switch puts other content first, and the planner's Experimental opened its first panel 40px under the hairline, from the 16px top margin that spaces its panels, so the page moved 16px on each switch from Simple.
16. **Four heading roles, one voice each, all in `shared.css`.** A section heading is `.op-section h2`, or `h2.section-title` where it is not inside an `.op-section` (a home panel, a panel head, a disclosure header): Rajdhani 18px, 700, 0.03em, uppercase, `--heading`. A sub-section is the global `h3` (15px, 600, 0.04em, `--text-dim`). A name -- an entity, a dialog or a card -- is `.entity-title` (22px, 700, `--text`), with `.entity-title-sm` (18px) and `.entity-title-xs` (15px): never larger than 22px, and never larger than the section h2 above it (the operator's skill name is `-sm` under the 18px "Skills" h2; it was 22px). A micro-label is `.label-tag`, kept a heading only when it heads a group (the /support tiers, a stage's rank labels) and a `<p>` otherwise (the stage legend's group labels, inside a `role="button"` overlay). A page stylesheet places a heading and never paints it: `audit:styles` (`headingRules`, strict) rejects a font size, colour, tracking or case on an h2 or h3 -- or on a class the TSX puts on one -- outside `shared.css`, unless it carries `.entity-title` (22px at most) or `.label-tag`; the Stronghold companion's pop-out headings are the named exception. The spec above checks each section heading's look in both themes and each entity title's size.
17. **First lines start on the section's edge.** In a stack, every block's first line starts on its parent's content edge. Lists keep their markers in a 1.1em column at the text's edge (the site reset, `:where(ul, ol)`), which a numbered list widens as its markers grow: 1.7em from ten items ("10.") and 2.3em from a hundred (`cards-and-headings.spec.ts` puts a 5-, 12- and 105-item list in a page and fails a marker past its list's box); a checkbox sits at the left of its cell, not centred in it; a row's side padding does not push its first control in (the operator page's voice player and lines had 6px and 4px); the operator panel's reading area starts on the header's inset (`--panel-inset` in `OperatorPage.module.css`); a stacked dossier gives its art band the content's inset; a row card that holds its art inside its hover edge (a padding and a transparent border: the home panels' cards, the Terminal home's rows) is drawn out by exactly that inset, so its art starts on the column's edge and `--heading-gap` under the heading while the edge draws in the panel's padding; a sticky bar whose top padding is its air under the nav once stuck (the music and operator guessers' setup bars, the Stronghold lookup, the voice player) rises by that padding at rest. The one inset: a picture card's text keeps `--card-inset` (12px) from its flush art, because the card's teal hover edge boxes it -- the video, roster, stage-mode, skin and supply cards used 10, 11, 12 and 14px. Boxed panels stacked in one column share one inset too: the /gacha operator preview's Skills, Modules and Base Skills panels were 18px in against Stats, Trait and Talents' 12px (`cards-and-headings.spec.ts` fails a panel whose heading starts at another inset). `page-bounds.spec.ts` (`stack-align`) fails a first line 3-120px right of its parent's edge while a sibling starts on it; `tests/browser/stack-align-baseline.json` accepts only the card insets, and only at `--card-inset`. The video card's entry is required: the Check builds /community and /community/videos from a checked-in feed (below), so a card is always on the page.
18. **Glyph art is ink.** The class, branch and faction glyphs (`/class-icons/`, `/branch-icons/`, `/faction-icons/`) are white art on a transparent ground. They are drawn as `<OperatorGameIcon src label size>`, a mask in the ink of the line or control they sit in (teal on a pressed chip), never as an `<img>`: as images they were white on the light theme's near-white, so /operators' class and branch chips, the class line under every roster card, the operator page's synergy and technique glyphs, /techniques' branch badges and branch tables and the planner's roster chips were blank squares (the planner had patched its own with `invert(1)`). The one `<img>` is over an operator's portrait on the stage deploy bar, where the game draws it white with a shadow. `cards-and-headings.spec.ts` visits every place that draws one, in both themes, and fails a glyph drawn as an `<img>`, a glyph under 3:1 against what it sits on (WCAG 1.4.11), or a place that shows none.
19. **Nothing moves when the webfonts arrive.** Rajdhani, Inter and JetBrains Mono load from Google Fonts with `display=swap`, so the first paint is in the fallback face, and every paint where Google Fonts is blocked. So a box that the face could resize is sized without it: the page header's eyebrow and h1 carry line heights of their own (14px; 38px, 30px on a phone: what the webfonts' `normal` gives), where at `normal` each line was the fallback's height until the fonts came in and everything under the header moved down 4px on every page; the operator page's star row is its meta's one 20px line (`OperatorPage.module.css`), where at `normal` the ★, which the Inter that Google Fonts' stylesheet gives a browser does not draw, came out 23px tall in a system face and made the header 3px taller whenever the build had not inlined that stylesheet or the webfonts were refused; a strip that wraps where its labels run out of room is given its rows (the game switcher: its own line under 720px, three games and then two under 560px, `components/minigames/GameLinks.module.css`) or kept to one row (the Terminal bar, under Tabs). `row-alignment.spec.ts` loads every game with Google Fonts refused and fails an eyebrow or h1 line, a switcher row or a header action that differs from the webfont's, and the operator page's header with and without them, failing a star row that is not 20px; `terminal-pages.spec.ts` does the same for the Terminal bar.
20. **The Check does not read live third-party feeds.** The community pages' videos come from the channels' YouTube feeds at build time, and those returned 404 for hours on 2026-09-27, so the pages built with "No videos found" and the picture-card and card-inset guards failed on every branch. The Check's Build step, its live-release build ("Pages render the live content release", which read every channel's feed live until 2026-09-27, through a fetch with no timeout) and the Playwright `webServer` set `ARKPEDIA_YOUTUBE_FEED_FIXTURE=tests/fixtures/youtube-feeds.xml`, and `lib/music/youtubeFeedsServer.ts` then reads that file instead of fetching (a fixture that is named and missing fails the build rather than render an empty feed). Deploy and `npm run dev` never set it, so production fetches live as before. `scripts/tests/test-youtube-feed-fixture.ts` holds all of that, including that every check.yml step that builds the site, and the Playwright config, name the same file.
<!-- end r9 rules 15-17 -->
21. **A × is the glyph alone, in a square you can miss it by.** Every button that closes or removes something with a × -- a dialog, a drawer, a popover, a sheet, a plan row, a banner goal, a queued track, a tile's description, a search field's text -- is `<XButton label>` (`components/ui/XButton.tsx`, `.btn-x` in `arkpedia-theme.css`): no border and no fill at rest, a drawn × in `--text-dim`, `--text` on hover over a faint fill of that ink (`color-mix` of `currentColor`, so it shows on any ground in either theme), the site's focus ring, and a square hit area of `var(--control-h)` each way; `dense` (a slot row, a tile's plate, inside a field) is 12px less, 24px or more at every token value (WCAG 2.5.8). The maintainer, 2026-09-27, on /pulls' goal rows: "remove the border around the x and make it square, this should be default for 'X' buttons, so it just looks like an x but its clickable even when not perfectly on the x symbol". On main before it (the dev site, measured 2026-09-27 at 1440 and on a phone), the site drew twenty-one of them in seventeen sizes: bordered boxes of 30x44 (/pulls' goal rows), 50x40 (both /gacha dialogs), 40x40 (the planner's import dialog, the mini player), 37x33 (the stage guesser's tile details) and 36x36 (the /schedule drawer, the /community map in fullscreen), and 32x32 ghosts (the /music queue); a 44px-wide glyph box as tall as its dialog head (the planner's operator dialog 44x40, goal dialog 44x48, build dialog 44x18); a 30x30 glyph on the plan rows, squeezed to 8x30 on a phone; 61x46 (the Stronghold records and Isomorph pairings), 22x22 (the Stronghold sheet), 22x24 (/base's room team), 20x19 with no name (the /base popover), 28x28 (the search field's clear), a separate 36x44 remove button beside each planner tab, and a literal "x" in mono 12px, 20x20, on the stage map. The glyph is a path, not a "×" character, so it sits on the same centre in Rajdhani, Inter and CI's fallback face. `label` is required: it is the accessible name, and "Close" is not enough where two things on the screen close. A page places the button (position, margins) and never repaints it; the one ink of its own is the stage map's tile plate, which is dark in both themes. A button that is a × in one state only takes `.btn-x` in that state and keeps one element, so focus stays on it (the /community map's fullscreen toggle, the mini player's collapse). A removable tab's × cannot be a button (a tab may not hold one), so it is `.tab-remove`, the same dense square. Not × buttons: a chip whose whole surface removes it with a decorative × after its name (/recruitment's selected tags: a labelled chip in a fixed grid), and a × that marks rather than acts (the operator guesser's wrong guesses, the /gacha tutorial). `audit:styles` (`xButton`, strict) rejects a `<button>`, or any element with an `onClick`, whose whole content is a × glyph (or one picked by a condition, or one alone in an element of its own), a drawn × (the player's close icon, `XGlyph`, or `XGlyph`'s path in a hand-written `<svg>`), or a lone icon -- one `<svg>`, or one self-closing icon component -- under an `aria-label` that starts with Close, Remove, Drop, Clear, Dismiss, Exit or Collapse (the net `x-buttons.spec.ts` casts on screen, and the audit fails if the two lists of words differ, so a × with a path or an icon of its own is found in every file, not only at the places the browser run drives; an icon button that is not a ×, a chevron or a trash can, is named for what it does -- "Hide the list", "Delete" -- or given a text label, and the net leaves it alone), without `.btn-x` in the state that shows it, and `controlHeight` holds a class given to `XButton` to the token like any control's; `tests/browser/x-buttons.spec.ts` drives the twenty-one places that show one (the /community map's by a client navigation whose page data moves the page's clock to the day before the first event, since the map shows only while one runs and the Check's build may have none; on desktop only, as the toggle is hidden at 700px and under) and fails a visible × with a border, a fill at rest, a box that is not square or under 24px, no name, or a press 8px from its glyph's centre (each way) that misses it, then presses it there and checks what it closed is gone. A dialog that opens from a text field takes focus on itself, not on its ×: Chromium carries `:focus-visible` from a field to whatever a script focuses next, so the planner's operator dialog, opened from the Simple search, focused its × and drew it in the site's teal focus ring -- a box round the glyph -- for a reader who had only clicked an option. The box (`tabIndex={-1}`, no ring of its own) is what a screen reader announces by the dialog's name, the first Tab reaches the ×, and Shift+Tab from the box stays in the dialog. `x-buttons.spec.ts` fails a × that is `:focus-visible` once its place has opened by pointer, and any focused element but a text field that draws a ring then (without `.wizard-box:focus { outline: none }` the whole dialog opened inside the teal ring), and walks that keyboard path. A × pinned to a frame's corner sits inside that frame: fullscreen, the /community map's wrap pads the map 24px in and not its button, which put the borderless × on the frame's corner line (main's opaque box had covered it), so fullscreen it is 8px inside the corner again, as at rest (`styles/maps/world.css`), and the spec fails a × outside the frame it is pinned to.

22. **A panel head is a title, its count, and one group of controls; a control the state cannot use is not shown.** A count that belongs to a title ("· 4 operators with goals", "· edited 18 days ago") follows it at one column gap and never floats: as the middle of three `space-between` items the planner's counts sat at 598, 796 and 631px at 1440; the title and its count are now one lead (`.plan-panel-lead` in `styles/planner/planner.css`), which takes the free space, and the count follows the title at the lead's 24px column gap. A separator never starts a line: the dot is a span of its own (`.plan-sep`, `aria-hidden`) hung in that gap, and where the count wraps under the title it hangs left of the lead's edge, which clips it (`overflow-x: clip`; nothing focusable is in the lead), so at 390 "Your plan" no longer read "· 4 operators with goals" on a line of its own (nor the Depot's count at 360). A dot inside a count is glued to the words on both sides with no-break spaces. On a phone (480px and under) a head's buttons share their line: flex-basis 0, a label's width each one's floor, so there is one full-width row where they fit and full-width rows where they do not, never a ragged one ("Your plan" had Clear and Your roster on a line and + Add a goal alone under them at 360 and 390); a pick-one pair and a chip never stretch (rule 13), so Still needed's stack one under the other on the panel's edge at every phone width. `tests/browser/planner-heads.spec.ts` fails a line of a head's text that starts with a separator (per-glyph boxes, cut to their clipping ancestors) and a row of controls that neither fills its group nor holds one control, at 360, 390, 412 and 1440. A head's controls are one group with one gap, each at its primitive's size: the planner's Show all was a `.filter-chip` with its own height, an 11px label and a 10px margin, so it stood 18.7px off Raw only where the segmented pair's own gap is 6, and 10px in from the line's edge when it wrapped on a phone. A wrapped line of controls starts on the group's edge. `row-alignment.spec.ts` ("the planner's panel heads") measures the count's gap, every gap in each group and each line's start, and the row census measures the heights in seven planner states seeded with a real plan (`census-routes.ts`, `PLANNER_STATES`: Simple on All and on an operator, Experimental, the depot open, and the roster, goal and build windows), which is where the maintainer found Clear 44px beside 33px on 2026-09-27 and which an empty planner never shows. A control that cannot do anything in the state on screen is left out, not drawn disabled without a reason (the planner's Farming route with no farmable short, as Show all is with nothing to show); a disabled control that stays says why in its `title` (Clear with nothing to clear). `planning-pages.spec.ts` fails a disabled control in the planner's panels with no title. On/off choices inside these panels are checkboxes (rule 3): the shortfall cards' Craft and the roster window's Owned were buttons drawing their own tick box, and `checkboxes.spec.ts` holds both to `.check`. A sentence that sums up the cards beside it is worked out from what they show, never asserted over them: the shortfall foot said "None of these can be made at the bench" beside a Guard Dualchip card tagged Factory recipe (`lib/planner/shortfallHint.ts`, `scripts/tests/test-shortfall-hint.ts`). A tile or row that sets a name beside a control gives the name room for its longest word: at the depot grid's old 206px minimum a material's name had 40-70px beside its control-height stepper and "Supplement", "Concentrated" or "Agglomerate" ran over the stepper's box (260px now), and where even that is short (a phone's 164px stepper of touch targets left "Polymerization" 82px, 7px short in CI's Linux fonts) the control goes under the name at the tile's right edge: the name's `min-width` is its longest word and the tile wraps, so the face that draws it decides, tile by tile. `planning-pages.spec.ts` fails a name whose glyphs reach its stepper or its tile's edge, at 1440, 1024, 860, 390 and 360. And a grid row places every cell: the plan rows' actions, placed by nothing under 1100px, fell into the 46px portrait column and ran 18px past it (the row census's `overflow`).

23. **Nothing that floats covers the page on a phone.** The site's one floating control, the collapsed mini player, is a tab in the right gutter at 900px and under (wherever the phone bar shows): exactly `--page-gutter` wide and flush with the screen's edge, so it ends where the page frame begins (rule 7; `page-bounds.spec.ts` holds every page's content inside it), 56px tall, with its teal accent on the side that faces the page and no drop shadow (it sits beside the page, not over it). The 44px tile it was, 8px off the edge, sat 20px over the page's right edge at 390 -- /pulls' goal list, the planner's materials, the top of an operator page's section menu (maintainer, 2026-09-28). The target is 24 x 56 (WCAG 2.5.8's 24px floor, as the dense × has) rather than the phone bar's 44 square, the price of never covering anything. While a modal dialog is open the tab steps aside (`visibility: hidden`), since a dialog that takes the screen puts its own controls in that corner (the planner's windows end in a Done at the right edge); over 900px the tile is unchanged. `tests/browser/music-tab.spec.ts` checks every census address and driven state (and /pulls with a banner goal) at 412, 390 and 360: the tab is in the gutter, and at the top, middle and end of the page no visible text box or control meets it, nor anything in the flow in the band it sweeps as the page scrolls; with a modal open, it is hidden.

24. **Text on an overlay reads in both themes.** A badge, tag or plate over art sits on a ground that does not follow the theme (a fixed dark scrim), so its ink does not either: it is `--scrim-ink` (or `--scrim-ink-dim` on a plate 86% opaque or more, and `--scrim-amber` for a figure the game draws amber), one value for both themes, never a theme text token, and a glyph drawn in `currentColor` there takes it too. On /enemies every tile's handbook code (`.enemy-tile-index`, "B1") took `--text` on `rgb(0 0 0 / 72%)`, and the light theme's dark `--text` read 1.4:1 there (2026-09-28); the Terminal cards' "no map data" tag was `--text-faint` on its plate, 2.44:1 light and 3.98:1 dark. The other way round, a panel whose ground follows the theme takes theme ink: the stage map legend's counts kept a fixed white from when its ground was a dark scrim, 1.06:1 in the light theme, and at 93% of `--bg` over the dark map its micro-labels read 4.2:1 (96% and `--text-dim` now). The stage map's HUD is the same case one level down: its readings are static chips on fixed dark plates inside one absolute box, and its DP figure took the theme's `--amber`, 1.96:1 in the light theme, with its cost glyph dark on dark and the "Recommended" label a 55% white at 3.74:1. `tests/browser/overlay-badges.spec.ts` reads every absolutely positioned box that paints its own ground (50% opaque or more), and every translucent plate inside an absolutely or fixed positioned box, on every census address and driven state, and with the stage map's legend open, in both themes, and fails any visible text on it under 4.5:1, a translucent ground composited over black and over white and the worse of the two counted; `scripts/tests/test-ui-tokens.ts` holds the scrim inks to one value and to 4.5:1 on their scrims over white.


25. **Images load as the reader nears them, and a page's hero loads first.** Every picture is `ContentImg` (a native `<img>`) or `ContentImage` (next/image), both in `components/content/ContentImage.tsx`, and both are lazy: fetched when the reader comes within the browser's lazy-load distance, and `ContentImg` is decoded off the main thread (`decoding="async"`). Neither takes a `loading`. The one way to fetch at once is `priority`, which also asks for the image first (`fetchpriority="high"`), and it is for a page's hero alone: the largest picture above the fold at load, its LCP as measured on 2026-09-29 -- the operator page's outfit on screen, the home page's first event poster (its LCP at 1440) and first banner (at 390), `/gacha`'s chosen banner, the event the Terminal leads with. A grid of equal tiles (/operators, /skins, /enemies, /stages/all, /music/discover, /schedule's event rows) has no hero: its LCP is whichever tile paints first, and they all stay lazy. Until then `ContentImg` was eager unless its caller said otherwise: /operators/Amiya fetched eight icons one to five screens down its panel at load, and /pulls four, while `/gacha`'s banner was as lazy as any icon (maintainer, 2026-09-29: "can you implement lazy loading for all, like operators don't have lazy loading").
    - **The operator artwork fetches the outfit on screen.** The picker's thumbnails are each outfit's 320px rendition, AVIF where the browser takes it (`sizes="68px"`, so every density picks it): they were each outfit's full artwork, all six of Amiya's at load for a strip of 68x46 stamps (1.8 MB; 121 KB now). Another outfit's artwork is fetched just before it is shown, into a hidden copy inside the artwork's box (`.op-carousel-warm`: absolutely placed like the pictures it stands behind, so it sizes nothing): when the reader points at, focuses or presses the control that would show it (an arrow, for its neighbour that way; a thumbnail or dot, for its own), and when it is picked (a click, a key, autoplay's turn). The picker marks the pick at once, and the picture on screen, with its caption, stays until the picked one is in (1.5s at most, the image-arrival hold), as a new src on any image does: the thumbnails' full artwork had been what put every outfit's picture in the browser before its switch, and without it a switch cross-faded to an empty frame that faded the picture in as it came (`motion.spec.ts`'s cross-fade test caught it). The picker's `onWarm` is required, so no picker can switch to a picture nothing asked for first.
    - **Two kinds of art stay as they are.** CSS art -- the class, branch and faction glyphs (rule 18), a mask on a `<span>` -- is fetched for every element the page draws, on screen or not, and the browser has no lazy loading for it. Holding one back would mean rendering it without its mask on the server, which cannot know where the fold is, so every glyph above the fold would pop in after hydration; they are about 1 KB each (a branch glyph 1.0-1.2 KB, a class glyph 0.8 KB) and every page shares them. And /techniques makes about 300 image requests at load out of its 1,953 images: none is in a closed table (a table renders only once it is opened), they are the icon grids inside the browser's own lazy-load distance (287 distinct images within 2,500px of the screen at 1440), and holding those back too would take `content-visibility` (estimated heights, so a different document height at load and a scroll bar that changes under the reader) or rendering on scroll (which find-in-page cannot search).
    - `scripts/tests/test-image-loading.ts` holds the defaults (lazy; `priority` eager at high priority; a caller's spread cannot turn either off), fails a native `<img>` outside `components/content` without a `loading`, a `loading` or a spread on an image component, and any `priority` not in its `PRIORITY` list, each entry with its reason (and fails one still listed that the source no longer has). The layout census's `image-loading` check holds each page's load to the same (section 3 below; `EAGER_ALLOWED` in `tests/browser/layout-checks.ts`), and `tests/browser/operator-artwork-loading.spec.ts` holds the artwork: one outfit's artwork at load, the thumbnails at 320px, one more when the reader switches, none when they go back, and the frame and the page's height unchanged by the switch.

<!-- r11 quiet polish: rule 23 -->
23. **Motion is quiet, it moves nothing, and a reader who asked for none gets none.** The maintainer chose option C, "Quiet polish", on 2026-09-26, with option A's blinking dot for LIVE (not C's glow pulse). What moves, and only ever by transform or opacity:
    - **Cards lift.** A picture card or pressable tile (the event carousel, banners, featured operators, skins, community and video cards, album covers, portraits, the /games cards, the roster and enemy tiles, the Terminal's stage, mode and supply cards) rises 3px (`translate: 0 -3px`) onto `--shadow-lift` under a pointer that hovers (`@media (hover: hover)`, so a tap on a phone does not leave one raised) and on keyboard focus. The `translate` property, so it composes with a card's own entrance transform; the shadow is on hover only, never at rest, since /operators and /synergies draw hundreds of these. Not controls, and not rows in dense lists. A new card class goes in motion.css's list; a card whose class is a CSS module's takes the global hook `.lift`. The operator page's artwork (it fills its pane and opens the zoom) does not lift. A lifted card is never cut by a box that clips it: `--shadow-lift` reaches 12px under a card and 4px beside it, which the home panels (overflow hidden) have room for, and in a scroller that has none (a `.scroll-row`, 4-6px under its cards; the score rail's 2px ends; the enemy grid, flush to its pane) the card takes `--shadow-lift-tight`, a contact shadow that fits. `.scroll-row` and the desktop `.enemy-grid-pane` hold 4px of padding above their cards for the rise, given back by a -4px margin so nothing moves (a row with a margin of its own takes the 4px off it, as `.front-skins-row` does). The first lift shadow reached 26px down: the scrollers cut it into a grey band with a hard edge and clipped the rise off each card's top edge, which `motion.spec.ts` now fails (a shadow's reach there is its offset, spread and 0.75 of its blur, past which under 7% of it is left).
    - **Buttons press in.** Buttons, chips and tabs take `scale: 0.97` while `:active`, easing back; not a text link, not a `.btn-bare` card, not a picture card (it is lifted, not pushed).
    - **The tab underline slides.** `<Tabs>` renders one `.tabs-indicator` per strip, a 2px bar placed with `translate(x, y) scaleX(width)` from the current tab's box (see Tabs).
    - **Images fade in as they arrive.** `lib/ui/imageArrival.ts`, started by `pages/_app.tsx` once the app has hydrated, sets `data-image-arrivals` on `<html>` and sorts every image as it enters the page (and every one there when the watch starts): one already in (the server's, or a picture the browser already has put in again), already drawing (its size is known, so its first rows can be on screen) or broken takes `data-shown` and is never faded, since a copy of a picture already on screen came in at once and fading it from nothing blinked it (the operator artwork's cross-fade puts the outgoing picture in again inside the box that fades it out, and it dropped to nothing at the switch); an image that has drawn nothing is held at opacity 0 (motion.css), which changes nothing on screen, and when it loads it takes `data-shown` and `data-arrived`, and motion.css plays `img-arrive`: an opacity fade with only a `from` and no fill, so it ends on the image's own opacity (a dimmed icon stays dimmed). The `data-arrived` mark comes off when the fade ends, so a panel shown again does not fade its images twice, and a new src on an image already shown (a banner picked, a wider srcset candidate) is never held or faded, since the old picture stays up until the new one is in. An image that arrives in a box that is not drawn (a closed panel, a hidden tab) is shown unfaded: a fade marked then would wait, unplayed, for the box to open. It fails open: an image that errors is shown at once, one that has not arrived 1.5s after coming on screen (`HOLD_MS`) is shown as it is and not faded later (a slow line draws an image row by row as it comes, and a fade at its end would blank the half-drawn picture: measured at 40 KB/s, 65 KB of a banner drawn, then a blank frame at its load), and without scripts or under reduced motion `<html>` never gets the attribute, so nothing is held. A byte-timing gate came first and was measured to fade nothing on a cold load (0 of 18 images on `/`, 0 of 49 on `/skins` over 4G): the art's origin does not send Timing-Allow-Origin, so the timing it read was the connection's, not the image's. `scripts/tests/test-image-arrival.ts` holds the sorting.
    - **LIVE blinks.** The badge's dot (`.badge-live::before`, a 6px circle in the badge's own ink, rule 14) blinks `1.2s steps(2, jump-none) infinite`, 50% at opacity .2.
    - **Panels have soft depth.** Not motion, so it stays under reduced motion: a boxed panel on the page ground (`.front-panel`, `.terminal-panel`, the /gacha sidebar and pity row, the operator page's panel, the /pulls, /recruitment, /support and /techniques panels, the stage rail, the planner's panels) carries `--shadow-panel`, lighter in the light theme and quieter than a lifted card; a box inside a panel carries none. Backgrounds and borders are unchanged: the home panels tried the primitive's `--panel-grad`, and their skin cards, which paint `--panel`, drew a box each.

    Every transition, animation and `@keyframes` the site adds from now on is in `styles/core/motion.css`, inside `@media (prefers-reduced-motion: no-preference)` (hover inside `(hover: hover)` as well), on three timings in `shared.css`: `--ease`, `--dur-1` (a lift, a press) and `--dur-2` (the slide, the fade). The ones written before it stay where they are, listed in `MOTION_LEGACY` (`scripts/audits/audit-motion.mjs`) with their reasons; the list only shrinks. Under reduced motion `shared.css` stops every transition on the site at once (they are all state changes, which become instant), and each older animation keeps its own `reduce` override, after it in its own file or more specific, because an animation can end in a state (the /gacha tutorial's fizzled chip ends hidden, and stays hidden). Four such stops had lost the cascade and stopped nothing: the site nav's menus and the phone drawer's overlay (nav.css's stop sat above the rules), the invalid card's shake (250 lines above it in shared.css) and the /gacha tutorial's pull cards (their slides' stop was in shared.css, which loads before gacha.css); all four follow their rules now. The /community carousel swaps its page without the fade there (it went to opacity 0 for 400ms, a blank, since the fade itself was stopped; `motion.spec.ts` drives the page clock past its 6s interval and fails a blank). Nothing is scroll-linked; each strip has one ResizeObserver; the image watch is passive capture listeners on the document, one MutationObserver and one IntersectionObserver.

    `audit:styles` (`motionScope`, strict) fails a transition, animation or `@keyframes` outside motion.css that `MOTION_LEGACY` does not list (and a listed one that is gone), an inline `transition` / `animation*` style or a script setting one in TSX (turning one off, `none` or `''`, is not motion), any rule in motion.css outside `prefers-reduced-motion: no-preference` or a `:hover` in it outside `(hover: hover)`, a rule that starts an animation (`animation`, `animation-name`) with no `reduce` stop that wins the cascade over it (a subject holding every simple selector of the animated one's, more specific, or as specific and later: the same file after it, or a stylesheet `_app.tsx` imports later), and the site-wide transition stop gone. `tests/browser/motion.spec.ts` holds the rendered page to it: with reduced motion, on every census address, after hovering its cards, pressing a button, switching a tab and scrolling the lazy images in, `document.getAnimations()` is empty; every element's layout box and the document's height are the same with motion on as off, the load's CLS is no worse (the worse of two fresh loads each way, since one movement scores differently by the frames it lands in, +0.01; `CLS_NOISY` names a route whose load shift is that luck on 957d76b too, /music's player at 0.06 to 0.39, and its score is not compared), no arrived image is left faded, and no image that has loaded or failed is still held; every picture card on sixteen routes (found as `cards-and-headings.spec.ts` finds them) rises on hover and focus without its layout box moving, is not cut by any box that clips it (its top edge, and its shadow's reach), and does not shrink when pressed; buttons, chips and tabs press in and a text link does not; every boxed panel on eleven routes carries `--shadow-panel`; the tab underline (below) and the LIVE dot; and an image put in after hydration is held while it has drawn nothing, then fades as it arrives (and leaves no mark), while one that 404s is shown at once, one that arrives in a closed box is shown unfaded, and one that never answers, or answers after the hold, is shown 1.5s after it is on screen (in a box shown later, 1.5s after the box is), an image loaded before hydration never fades, nor does a copy of a picture already in (put in later, or the operator artwork's outgoing picture), and a page without scripts holds nothing. The reduced-motion pass also checks that nothing is held there and opens the site's menu (a nav group at 1440, the drawer on a phone), and the layout pass compares every element's opacity with motion on and off, so an entrance stopped at its start (invisible) fails.
<!-- end r11 rule 23 -->

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
| `--scrim-ink` / `--scrim-ink-dim` / `--scrim-amber` | #BCC8CF / #93a6b1 / #e0aa4e | the same | Text on a fixed dark scrim over art (rule 24): one value for both themes, never restated in the light block. The dim one only on a plate 86% opaque or more; the amber for a figure on one (the stage HUD's DP). |

### Lines and controls

| Token | Dark | Light | Use |
|---|---|---|---|
| `--line` / `--line-soft` | white .10 / .06 | black .12 / .07 | Passive hairlines only |
| `--control-border` | white .25 | #98a3ab | The resting border of every control: 2.28:1 (dark) and 2.5:1 (light) on `--panel`, and 2:1 or more on every surface. `test-ui-tokens.ts` holds it between 2.2 and 2.6:1 on the panel, so it can soften no further and harden no further. |
| `--card-border` | white .16 | #bac2c8 | The quieter resting edge of a large pressable surface: `.pick-card` (not `.pick-card-picture`, which has none), a row card, a tall disclosure row. Between `--line` and `--control-border`. |

### Control height

| Token | Value | Use |
|---|---|---|
| `--control-h-base` | 36px | **The one value to change.** The height of every control in a row. The maintainer may flip it (to 32px, say): it is one line, and nothing else states a control height. |
| `--control-h` | `--control-h-base`, plus 4px at ≤720 (36 / 40 today; 32 / 36 flipped) | What controls read: `min-height: var(--control-h)` on the primitives, `height` or `width` of a square icon button (`.btn-icon`, `.btn-x`), a joined stepper's parts at `calc(var(--control-h) - 2px)` inside its 1px frame. |

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

### Motion and depth (rule 23)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | | Every motion's easing: quick to start, slow to land |
| `--dur-1` | 0.15s | | Small feedback: a card's lift, a press |
| `--dur-2` | 0.3s | | A move the eye follows: the tab underline, an image fading in |
| `--shadow-panel` | a hairline highlight, a 2px contact shadow and a soft 24px fall-off | the same, lighter | A boxed panel on the page ground, at rest |
| `--shadow-lift` | `0 8px 14px -6px` black .75 | the same, ink .28 | A picture card or tile raised under the pointer or focus, never at rest |
| `--shadow-lift-tight` | `0 3px 5px -4px` black .85 | the same, ink .4 | The same lift inside a scroller that leaves a card no room (`.scroll-row`, the score rail, the enemy grid) |

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
- **The underline slides** (rule 23). The server's HTML draws it as the current tab's own `::after`, which is also all a link strip (`nav.tabs`) ever draws. `<Tabs>` renders one `.tabs-indicator` per strip, hidden until the browser has measured the current tab: in a layout effect, before the first paint after hydration, it is put exactly where the `::after` is (the tab's box, along its foot, from `getBoundingClientRect` with the tab's own press scale taken back out), and only then does `data-slide` on the strip show it and hide the `::after`, in one style change, so nothing blinks, doubles or slides in from the corner. A new value moves it (`transform` over `--dur-2`, motion.css, no-preference only; under reduced motion it jumps); a relayout -- the webfont arriving, a count changing a label, a resize, the strip wrapping onto a second row -- puts it in place at once, from one ResizeObserver per strip watching the strip and each tab. The bar is absolutely placed, so it takes no room and moves nothing. `motion.spec.ts` checks, on five pages' strips, that it takes over under the tab (1px) and not moving, slides (a `transform` transition) on the first press, then sits under the current tab after a click on every tab, after Right, End and Home, and after a resize and back, and that the page reports no hydration error.
- A page places the strip (margins) and never restyles a tab: no side padding, border or fill from a feature rule (the planner's old `.simple-operator-tabs button` rule did all three). The `tab-align` census fails a boxed `.tab`.
- Vertically, a strip is measured by its tabs' boxes, like a chip row: the box is the tab's hit area and carries the underline at its foot. So a strip that opens a page starts 24px under the header hairline, and one under a section heading starts `--heading-gap` below it (rules 15 and 17; `tests/browser/section-census.ts` counts a `.tab` as a control). Its label is centred in the box, as a chip's is.
- An `ariaLabel` starts with what the tab shows (WCAG 2.5.3, label in name): the /gacha preview's skill tabs show "S1" and are named "S1: <skill name>" (they were "Skill 1: …", so "click S1" in voice control found nothing). Only letters and digits count, since a symbol is not spoken as drawn: the /dev/ui specimen's "6★" named "6-star" is right. `tabs.spec.ts` checks every tab of every strip it presses.
- `removable={{ onRemove, label }}` makes tabs removable (the planner's operators): Delete or Backspace on the focused tab removes it, and focus lands on the tab the page makes current once it re-renders (the planner's All), not on a neighbour at tabindex -1 that a screen reader announces "not selected"; the tab draws a × that does the same on a click. A tab may not hold a button, so the × is not one; `label(option)` names it ("Remove Amiya from plan") and returns `null` for a tab that stays (All). The × and Delete are shortcuts for a mouse and a keyboard only: the × is `aria-hidden` and Delete needs a keyboard, so a touch screen reader or voice control cannot reach either. **A page that makes tabs removable also renders a real button for it inside the panel** (the planner's dossier has "Remove from plan", a `.ghost .btn-sm`, focus going to All after it), and the × is the × buttons' dense square (`.tab-remove`, rule 21: 24px each way, 28 on a phone, WCAG 2.5.8; on main it was a separate 36x44 remove button beside each operator's chip, and when the chips first became tabs, a ~17x18 glyph against the tab's own label with a 25x26 pseudo-element round it). `tests/browser/tabs.spec.ts` fails without either.
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
- It is `inline-flex` with a gap, and its dot is `::before`: a 6px circle in the badge's own ink (option A's, maintainer 2026-09-26), drawn by `arkpedia-theme.css`, so the badge is its final width from the server's first paint and nothing beside it moves when scripts run. The dot blinks (`blink 1.2s steps(2, jump-none) infinite`, 50% at .2) in motion.css; under reduced motion it stays, still. `motion.spec.ts` checks every badge on /schedule (its clock moved into an event, so there is always one), /gacha and /stages/all, with and without motion, and the dot with scripts off.
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
- Uses today: `/pulls` recurring income (five sources and Monthly card), Include past rewards (in the Past events frame, below), Include sparking, Already cleared and the unclaimed-rewards list; `/recruitment` Prioritize 4★+ and Robots; the stage guesser's chapter and event list; the music guesser's Include CN, release list and category select-all.
- **A setting that belongs to a disclosure sits inside the disclosure's frame**, as /pulls' "PAST EVENTS  [ ] Include  +" does (the maintainer, 2026-09-27: "in the actual dropdown menu button not as an element in the dropdown"). The disclosure `<button>` is the frame: it spans it and paints it, so it rests, hovers, opens and takes focus exactly like the triggers beside it, and a press anywhere but the setting is a press on it. The `.check` label is its **sibling** laid over it (`position: relative; z-index: 1`), never its child: a `<button>` may not hold an input, and the accessibility tree flattens one that does. The button is a `subgrid` of the frame's three columns -- its label in the first, which gives way (an ellipsis) rather than run under the setting, nothing in the second, where the setting sits, and its + in the third -- so the + stays after the setting at every width. Tab reaches the button, then the checkbox; hovering the checkbox does not light the frame, since the label is not inside the button. It was a trigger with the checkbox beside it, outside its frame, plus a copy beside the panel's heading for phones that CSS hid at every width. `tests/browser/pulls.spec.ts` holds the structure (no input in the button, the label its sibling, one copy on the page), the box (the checkbox inside the frame on its centre line, the label before the +, the frame the height of its siblings), the press areas, the keyboard and focus rings, and the saved setting; `row-alignment.spec.ts`'s census measures the frame in its row. Between the phone's one column and the full row (701-900px) the three triggers take two lines, Income & events beside Past events and the wishlist under them: squeezed into one line their labels wrapped to two (46px triggers at 701-760px), and the frame now also holds the checkbox.
- An independent filter stays a `.filter-chip` with `aria-pressed`; a setting or a list you tick is a checkbox, even where its label names the state (the planner's shortfall Craft and the roster window's Owned were buttons drawing their own tick and are `.check` checkboxes, rule 22).
- Pick-one groups are not checkboxes: they are `SegmentedControl` (the music guesser's clip start and the stage guesser's search mode were radios and are segmented controls).

### Buttons

| Class | Use |
|---|---|
| *(none)* on `<button>`, or `.btn` on a link | Secondary action: `--row-grad` with a `--control-border` border |
| `.primary` | The one action that matters on the screen: teal fill with `--teal-ink` text |
| `.ghost` | Tertiary actions and dense toolbars: transparent with a `--control-border` border |
| `.danger` | Destructive actions (Reset, Start over, Delete): red border and text |
| `.btn-sm` | The row size: `var(--control-h)` tall, 12px, padding 4/14. A base or `.primary` button beside other controls takes it. |
| `.btn-icon` | A square icon button at `var(--control-h)` both ways (a month step, a play glyph, a help "?"), on any variant: `btn-icon` (the button surface), `ghost btn-icon` (transparent). A close or remove × is not one: it is `.btn-x`. |
| `.btn-x` | The × that closes or removes, rendered as `<XButton label onClick />` (rule 21): no border and no fill at rest, a drawn × in a `var(--control-h)` square, `--text` on hover over a faint fill; `dense` is 12px less (24px or more). |
| `.btn-lg` | The unused large face (17px). |
| `.btn-bare` | A `<button>` that is **not** a button: a card, a tile, a list row, an album cover. The base button rules skip it entirely (no uppercase, no tracking, no weight, no inline-flex centring, no teal hover), so your own class supplies the look. A card without it inherits the button voice onto its own font: the Stronghold enemy and Isomorph rows rendered Inter 16 uppercase at 0.09em, the /gacha featured chips Inter 11 at 0.09em. `tests/browser/cards-and-headings.spec.ts` fails on any visible button computing Inter or JetBrains Mono with the 0.09em tracking, on every census address and state. Once your class boxes it in `--control-border` it is a control again, held to `var(--control-h)` in a row (rule 4: the row census and `controlHeight` both count it). |
| `.pick-card` | A selectable card (a preset, a banner). It has the quieter `--card-border` frame and a teal hover. When picked (`aria-pressed`, `aria-selected`, `aria-checked` or `.is-selected`) it has a teal border over `--teal-dim`. Use it with `.btn-bare`. With `.pick-card-picture` (a card whose main content is a picture: the /pulls skin wishlist) it is a picture card: no border at rest, its fill clipped inside the transparent edge, the teal edge on hover and keyboard focus, and the same picked state. |

**Four variants, two sizes.** The variants are base, `.primary`, `.ghost` and `.danger`. The sizes are the 44px call to action (base or `.primary` standing on its own: padding 12/24, 14px) and the control height (`var(--control-h)`), which `.ghost` and `.danger` always have and base or `.primary` take with `.btn-sm`. A primary beside a ghost takes the control size by itself (the sibling rule in `shared.css`). There are no one-off sizes: the planner's and the operator page's two-line MAX tiles, the support links (a 12px copy of `.btn` on a 4px radius), the stage list's 26px Clear and the 42px Stronghold launch buttons are all one of the eight now, and every close or remove × is the one `.btn-x` (rule 21).

- **The documented exception:** the `/gacha` X1/X10/Reset pull row (`.gacha-action`, 42px, 15/700 at 0.05em) stays as it is, because `/gacha` is the reference page and its action row is part of what was chosen. `CONTROL_HEIGHT_EXEMPT` names it, with the few other controls that are not in a row (the Stronghold companion's compact kit, picture cards, the /base map's on-canvas buttons, menu rows). Tabs are not row controls and are not on the token: `.tab` is a label with an underline, no box (see Tabs).

```tsx
<button type="button" className="btn-bare album-tile" onClick={open}>…</button>
<button type="button" className="btn-bare pick-card" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>…</button>
<button type="button" className="danger" onClick={reset}>Reset base</button>
{/* In a row with a field: the row size, not the 44px call to action. */}
<SearchInput … /><button type="submit" className="primary btn-sm">Guess</button>
<XButton label="Close" onClick={close} />   {/* components/ui/XButton: never a hand-written × button */}
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

- The trigger is `var(--control-h)` tall, like every control in a row; `size="title"` is the heading-sized trigger (22px Rajdhani uppercase, no fill, the same height), used for the calendar's month and year between the two `.ghost .btn-icon` month steps. A title trigger shows its whole value: on a phone the month gets what the two steps and the year leave (105px at 390, 75 at 360, against 109 for SEPTEMBER), so the month takes `renderValue={renderMonthValue}` (`components/schedule/CalendarMonthValue.tsx`), which shows the first three letters at 440px and under and keeps the full name for a screen reader. `row-alignment.spec.ts` picks every month at 360, 390, 460 and 1440 and fails a value wider than its trigger's box. A title trigger also holds one width whatever is picked, so the controls after it never move as the value changes: its value renders every option in one grid cell, hidden, under the one shown (`renderMonthValue`, `steadyValue`), and `row-alignment.spec.ts` presses Next month through a year at 360, 390, 460 and 1440 and fails a head control that moves.
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

Used by `/events/[slug]` (sections and reward stores), `/schedule` (Events / Calendar: the calendar is shorter, and the switch clamped the reader 51px up at 1440) /recruitment's Calculator / Guarantee cheat sheet (the calculator is half the cheat sheet's height: 143px at 1440; the page's own copy only, since the pop-out window scrolls on its own), the planner's Simple / Experimental (98px at 1440, 88 at 390) and the planner's per-operator tabs (an operator's dossier is taller than All materials; a 249px clamp on a phone was seen in one run and did not reproduce, so the hold there is the pattern rather than a measured fix). `capture()` counts the margins that collapse through the container's top and bottom edges as part of what the switch takes away: the page counts them and the container's box does not. The planner's Experimental panel opened with a 16px margin that Simple did not have (its first `.plan-panel`'s, removed since, so that Experimental starts 24px under the header as Simple does: rule 15), and the hold for Experimental -> Simple came out 16px short on a phone (`tabs.spec.ts`); no panel on the site opens with such a margin now, and the count stays for the next one that does. A panel that scrolls inside a dialog cannot use it (it measures the document); the `/gacha` preview's module panel holds its tallest height per operator instead.

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
| `xButton` (strict) | A `<button>` (or any element with an `onClick`) in TSX whose whole content is a × glyph -- ×, ✕, ✖, x, `&times;`, `&#10005;`, a quoted one, one picked by a condition, one alone in an element of its own -- or a drawn × (the player's close icon, `<XGlyph />`, or its path `m4 4 8 8M12 4l-8 8` copied into an `<svg>`), or a lone icon (one `<svg>`, or one self-closing component such as `<CloseIcon />`) in a button whose `aria-label` starts with Close, Remove, Drop, Clear, Dismiss, Exit or Collapse (`x-buttons.spec.ts`'s net on screen), without `btn-x` (or `tab-remove`) in its class list, where a class a template literal picks in `${...}` counts; a × drawn by a `.tab-remove` or `.btn-x` element inside it is that element's | Render `components/ui/XButton` with its `label` (rule 21) |
| `controlHeight` (strict) | A literal `height` / `min-height` on a control: outside `styles/core`, any rule whose subject is a button, text input, select or textarea, a primitive class, or a class TSX puts on one (not a `.btn-bare`, never a dot), and a class TSX puts on a `.btn-bare` button that a rule boxes in `--control-border` at rest, at a height a row control could have (20-56px); a textarea (the element, or a class TSX puts on a `<textarea>`) only at such a height too, since a multi-line field is taller than any row; inside `styles/core`, a primitive class. `CONTROL_HEIGHT_EXEMPT` lists the few that are not row controls, each with its reason, and fails on a stale entry | Read `var(--control-h)` (or take `.btn-sm` / `.btn-icon`) and delete the page's height |
| `headingRules` (strict) | Heading paint (`font-size`, `font`, `color`, `letter-spacing`, `text-transform`) on an h2 or h3 subject -- the element, or a class the TSX puts on an `<h2>`/`<h3>` -- outside `shared.css`, unless the subject carries `.entity-title` (which may not exceed 22px) or `.label-tag`; `HEADING_EXEMPT` names the Stronghold companion's pop-out headings | Use `.op-section h2` / `.section-title`, the global `h3`, `.entity-title` or `.label-tag` (rule 16), and keep only margins and layout in the page |
| `motionScope` (strict) | A transition, animation or `@keyframes` outside `styles/core/motion.css` that `MOTION_LEGACY` (`scripts/audits/audit-motion.mjs`) does not list, or a listed one that is gone; an inline `transition` / `animation*` style or a script setting one in TSX (`none` and `''` turn motion off and pass); a rule in motion.css outside `@media (prefers-reduced-motion: no-preference)`, or a `:hover` there outside `@media (hover: hover)`; an animation outside it with no `prefers-reduced-motion: reduce` stop that wins the cascade; the site-wide transition stop in `shared.css` gone | Put the motion in motion.css, inside the no-preference block, on `--ease` / `--dur-1` / `--dur-2` (rule 23); moving a `MOTION_LEGACY` entry there is welcome, then delete the entry |
| `tealDecoration` (strict) | `var(--teal)`, `--teal-dim` or `--teal-fill` as a colour, background, border, outline or shadow on a selector with no state in it (`:hover`, `:focus`, `:checked`, `[aria-pressed]`, `[aria-current]`, `.current`, `.live`, `.open`...), in the folders of `TEAL_DECORATION_SCOPE` (`styles/stages/`) | Recolour it (`--text-dim`, `--heading` for a heading), or qualify the selector with the state it marks |

```sh
npm run audit:styles                 # check
npm run audit:styles -- --update     # after a fix: tighten (review the diff, it must only shrink)
```

The audit sees only what CSS and TSX text show. A weight on a rule that inherits its family, or an `<h1 className={styles.x}>`, is invisible to it. The browser test and the rig measure the rendered result.

### 2. `tests/browser/page-bounds-baseline.json` (the layout census, `tests/browser/layout-census.spec.ts`, in `npm run test:browser`)

For every page at 1440 and 390, the layout census measures (the page-bounds checks; their code is in `tests/browser/layout-checks.ts`):

- `no-h1`: the page has no h1 (a visually hidden one is fine).
- `h1-align`: the visible h1's left edge is not where the content starts.
- `frame`: content lies outside 224–1216 at 1440, or outside 24–366 at 390.
- `page-scroll-x`: the page itself scrolls sideways.
- `tab-align`: a tab strip or pick-one row that leads its line (`[role=tablist]`, `.tabs`, `.seg-control`, a `*-tabs` class, or a row of two or more chips) has its first item off the section's edge by more than 2px (the edges are the nearest heading's text-left in the same column, the content edge of the section, dialog or panel it is in, the block on the line above it, and the frame), or grows an item wider than its content (flex-grow, or equal `fr` columns); and any visible `.tab` that draws a box (side padding, a border or a fill: a page rule restyling the tabs). Measured in the dark theme and again in the light one (`tests/browser/tab-align.ts`, rule 13). A row placed beside something on its line (the map tools beside MAP, a sort row at the end of a toolbar) is not measured.

- `first-gap`: the first content in `main` is not 24px (±2) under the header hairline. A Terminal scene at 700px and under expects 14px and the operator page 16px (rule 15); both are named in the spec.
- `motion`: an animation that moves content (keyframes on transform, translate, scale, rotate or an inset) exists under `prefers-reduced-motion: reduce`. The pages are measured with reduced motion so nothing is caught mid-flight, and the reader who asked for it gets none. A page's reduced-motion override belongs in the same file as the animation, after it: the one for the roster cards sat in `shared.css`, lost the cascade to `roster.css`, and the cards rose 24px in anyway (first-gap read 26.5px under load).

It also runs `stack-align` (rule 17) against its own baseline, `tests/browser/stack-align-baseline.json`: the picture cards whose text keeps `--card-inset`, each accepted only at that inset (an entry that shows only on some days, a card in a date window or a stage open by weekday, is marked `optional` and escapes only the stale check). A driven state the route list never shows, the planner's operator dossier, is checked at both widths too (`page-bounds.spec.ts`). Every other first line set 3-120px in from its parent's edge fails, and an accepted entry no page shows any more fails as stale. `tests/browser/section-census.ts` does the measuring (it also serves the census's heading and section checks) and says what it leaves out: content centred or end-aligned across the section (a control centred alone in a small cell is still an indent), a tile that centres an icon over its label, content out of flow, inline runs; a row boxed by its state (the selected stage row, the playing voice line) is measured by its content, a disclosure marker or generated glyph leads its element, and a list's markers sit in its 1.1em column. When no child starts on the parent's edge, the leftmost child is the edge, so two siblings that disagree (the operator panel's header and reading area) fail too. A card inset is checked by its content box, not its first glyph.

The baseline is `{}` and the test is strict: every measured page passes at both widths, so any offence fails, and `UPDATE_BOUNDS_BASELINE=1 npx playwright test layout-census.spec` measures every page but refuses to write a non-empty baseline. Fix the page.

`page-bounds.spec.ts` also fails when a page file under `pages/` is neither measured nor excluded with a reason (dynamic pages need a sample address in `BOUNDS_SAMPLES`, `layout-checks.ts`). It also checks that the 404 page renders on `--bg` in both themes.

<!-- r11 layout census: one load per page (tests/browser/layout-census.spec.ts) -->
### 3. The layout census: every per-page check on one load (`tests/browser/layout-census.spec.ts`)

Every address and driven state the UI census visits (`tests/browser/census-routes.ts`: one address per page file, the 404, two extra addresses and the driven states) is loaded **once per theme per project**, and every per-page layout check runs on that load: the desktop project at 1440, the mobile one at 390 (its Pixel 7 narrowed to the census width). Until r11 three specs loaded the same pages in tests of their own (842 of the suite's 1,212 tests, over half its time).

| check | pages | themes and widths |
|---|---|---|
| `headings`: the section-heading look and `.entity-title` sizes (rule 16) | `HEADING_ROUTES` | dark at 1440 and 390, light at 1440 |
| `heading-gap`, `section-gap` (rule 15) | `HEADING_ROUTES` | dark, 1440 and 390 |
| `picture-cards`: no resting frame (and `CONTENT_CARDS`) | `PICTURE_ROUTES` (three are loaded for this alone) | both themes, 1440 and 390 |
| `picture-hover`: the teal edge on hover and keyboard focus | `PICTURE_ROUTES` | both themes, 1440 |
| `home-cards` | `/` | both themes, 1440 and 390 (hover at 1440) |
| `button-voice`: no button in Inter or JetBrains Mono at the button tracking | every address and state | dark, 1440 |
| `page-bounds` (section 2 above) and `stack-align` | every address but the Stronghold companion and the two extras | dark, 1440 and 390 |
| `first-gap` on a driven state | every state | dark, 1440 and 390 |
| `tab-align` on a driven state (rule 13; `tabs.spec.ts` keeps the states the census does not drive) | every state | dark (the light theme flipped in place), 1440 and 390 |
| `rows`: one centre line, one control height (rule 4, `row-census.ts`) | every address and state | dark, 1440 and 390 |
| `image-loading`: at the load, every image lazy but the page's hero, which is eager at `fetchpriority="high"` and on the first screen (rule 25; `EAGER_ALLOWED`, and `LAZY_FOLD`, 1.25 screens); a hero drawn lazy fails, and one the page does not show fails as stale unless `optional` | every page-bounds address, on the page-bounds load | dark, 1440 and 390 |

- Page bounds and a state's first-gap are measured with `prefers-reduced-motion: reduce` from the first paint, the rest with motion on. So such a page loads with reduced motion, gets those checks first (page bounds straight after the load event and the fonts, so the `motion` check still sees an entrance animation that runs), then has motion turned back on, lets the animations that starts end, and gets the rest.
- The census's pages spread over every worker (`playwright.config.ts` runs one browser per two CPUs, at least two and at most three, and at most one per 2 GB of memory; `PW_WORKERS=1` runs serially). The one check that needs every page at both widths, the stale `stack-align` entry, reads what each page bounds run wrote, in `layout-census-after.spec.ts`: a project of its own (`after-census`) that runs once the desktop and mobile projects are done, so it runs with the whole suite (`npx playwright test layout-census.spec` runs the census alone, without it; naming the project or its file runs everything it depends on first).
- Every failure names its check, page, width and theme: `[rows] /pulls at 390px, dark: ...`. Each check reports with `expect.soft`, and an error inside one (a timeout) is that check's failure, so one failing check never hides another on the same load.
- **A new per-page check goes on the census's load**: its evaluator and its table in `layout-checks.ts`, its assertions in `layout-census.spec.ts`. A spec of its own that loops over the census pages again adds ~90 page loads, and `scripts/tests/test-layout-census.ts` (in `npm test`) fails it: no spec but the census loops over `censusRoutes()`, `CENSUS_STATES`, `boundsRoutes()`, `HEADING_ROUTES` or `PICTURE_ROUTES`, and the per-page tables live in `layout-checks.ts`. A test that drives one state or flips a token or the webfonts (the goal row, the month menus, the panel header without webfonts) stays a dedicated test in its spec.
<!-- end r11 layout census -->

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
11. Run `npm run audit:styles` and the layout census (`npx playwright test layout-census.spec`; the stale stack-align check runs with the whole suite, after both projects). If a remaining ratchet list shrank, tighten it with `npm run audit:styles -- --update` and commit the smaller baseline with the change.
12. Verify the rendered result at 1440 and 390, dark and light (the rig, or screenshots). A green build is not verification.
