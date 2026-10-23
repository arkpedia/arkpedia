# Site-wide design review — 2026-10-23

Reviewed against `dev` at `2b4ca91a`, on `codex/coherent-directories`.
Product reference: [Design system](design-system.md). Exact implementation rules:
[UI primitives and tokens](ui-primitives.md).

## Scope and method

The review covers the whole route tree, not just Story and the four directories named
in the original feedback. The source inventory has 66 page files, 170 React component
files and 44 global stylesheets, plus component CSS modules. Redirects and shared page
wrappers were traced to their actual rendering components. The design system's route
inventory records the pattern chosen for every family.

Visual overview: 64 representative URLs, each at 1440px in dark mode and 390px in light
mode (128 viewport captures). These include dynamic operator/event/stage records,
Story's list URL, development tools, the recruitment popout, the Stronghold companion
and both error-page designs. The 404/500 responses on the error pages are expected.
No capture showed document-wide horizontal overflow.

The overview captures show initial page composition, not proof that every external
image or live feed delivered. More detailed checks use the existing production-mode
layout census, which also drives dialogs, filters, populated planners and tab states.
Do not treat this review as an exhaustive accessibility, performance, media-delivery
or every-game-state certification.

## Findings and changes

| Finding | Resolution |
| --- | --- |
| Story's two destination panels competed with its actual library | Replaced them with compact shared ghost links; retained the external-reader destination and Manga route |
| List looked like another small map tool beside zoom/Fit | Moved List beside Timo's reader and Manga; removed the Map button and named the default section Story map. List toggles the searchable catalogue, with the state kept in the URL |
| Follow-up Story navigation wording/order | Reading destinations now appear as Full List, Manga, then Timo's Story Reader |
| Base actions and source choices occupied separate rows | Combined Save image, Edit layout, Your plan and Imported account into one toolbar; it scrolls within the page on a narrow screen. Renamed the formation action View base |
| Schedule's normal list hid historical events | Added a fixed Upcoming/Past selector and a shareable `?past=1` archive: confirmed finished events, newest first, linked to their event pages. Counts and ordering sit beneath the selector, which disappears in Calendar; the archive is also a driven layout-census state |
| Artist and voice-actor directories used full-width rows, unlike mechanics directories | Migrated to the same responsive directory grid/surface as techniques and synergies; retained alphabetic grouping, all visible operator credits, queries and filters |
| Repeated card-grid/surface rules had separate feature owners | Added shared `.directory-grid`, `.directory-card` and a wide composition modifier; feature styles own inner layout only |
| Credit names used the smaller sheet-title size | Aligned them with the 18px directory-card title hierarchy |
| Manga used its own framed surface and grid rhythm | Adopted the shared wide directory grid and surface while preserving landscape covers and independent chapter actions |
| Base rotation notices used inline 6px radii, nonstandard/undefined accent references and an ad hoc progress bar | Used shared neutral/error notices, token radii and the existing meter; added progress semantics and removed the obsolete inline animation exception |
| The high-level design rationale was scattered through implementation history | Added a maintained product design reference, route-family matrix and explicit card/row/table/map decisions; linked it from the README, docs index and UI specification |
| Future contributors could miss the reference | Added project guidance to `AGENTS.md` and directory examples to the development UI gallery |
| Windows paths made style checks falsely report core primitives as violations | Normalized logical audit paths, used `fileURLToPath`, and fixed CRLF handling in the layout-suite guard |
| The dead-primitive scanner missed literal JSX classes after prose apostrophes | Added an independent literal `className` scan, retaining the existing dynamic-string scan |
| The UI introduction described `--heading` as a different color, although the theme aliases it to teal | Corrected the reference; retained the separate semantic token |

## Decisions across the remaining site

The following are deliberate pattern differences, not competing visual systems:

- **Operators, skins, enemies, albums and videos:** image-led browsing remains appropriate.
  Keep their art proportions and information density; share tokens and interaction states.
- **Search, music tracks, account history, credits and poll data:** rows/tables remain useful
  for scanning and comparison. Do not wrap each row in an unrelated promotional card.
- **Schedule and events:** chronology is the main relationship. Keep calendar/list choices,
  dates, status and reward sections consistent with the shared controls and headings.
- **Stages, Story and base:** maps/boards convey relationships that a grid cannot replace.
  Separate their navigation from map tools and keep alternatives where available.
- **Planners, recruitment and account tools:** retain functional panels and aligned controls;
  test their populated state, not just the empty page.
- **Games and Stronghold:** preserve the actual play area and the companion's intentional
  compact/full-bleed mode. Their controls still use the site language.
- **Home, community, support and informational pages:** use editorial sections or purposeful
  action panels. Their content is not an entity directory simply because it has links.
- **Development and error views:** retain shared headings, controls, themes and recovery
  actions. Popout/redirect exceptions are named in the route inventory.

The site already had broad primitive coverage. Replacing all of these compositions with
one card template would lose useful hierarchy and data relationships; this review instead
aligns equivalent tasks and makes the reasons for differences explicit.

## Interaction review: long lists and return navigation

This follow-up checks the route families for disappearing controls, moving view choices,
lost browsing state and competing sticky layers. The layout census covers the full route
inventory; driven checks exercise the changed browsing journeys rather than treating a
first-screen screenshot as proof of their interactions.

| Family | Finding and resolution |
| --- | --- |
| Operators, skins, artists, voice actors, techniques, synergies | Search/filter controls lived inside a short header and disappeared while reading long results. `PageHeader stickyActions` places compact bars after the title at the same frame width. Phone filters retain the existing sheet. Oversized desktop filters stay in document flow. |
| Schedule | The fixed Upcoming/Past selector and count now follow the reader through the list. Calendar hides them. Both options remain mounted with stable dimensions. |
| Story | Full List search/category controls now remain reachable while browsing. Category anchors reserve space below the toolbar. Map zoom/full-screen controls retain their own context. |
| Community | Section and search previously reset when leaving the page. `section`/`q` now preserve them in the URL; compact section navigation follows the list, and the selected tab names its actual panel. A height hold prevents shorter sections clamping the reader upward. |
| Reward Tracker | Reward type previously reset after leaving/reloading. `view` now preserves the selection; its local tabs are sticky and switching preserves the list's height. |
| Enemy handbook, stages, Music, operator/game workspaces | Existing sticky panes/section headers already serve their browsing contexts. Preserve those arrangements rather than stack a second toolbar over them. |
| Base, account, planners, games, editorial and informational pages | Keep primary actions and page introductions in their existing context. Do not pin an entire title, setup form, account summary or simulation panel merely for visual uniformity. |

Sticky bars use the measured site-nav offset, opaque theme background and a stacking level
below menus/dialogs. They stay in normal flow if the controls exceed 176px, the complete
bar exceeds one quarter of the viewport, or the viewport is shorter than 480px. Native sticky retains the original space;
the component also contributes its measured height to anchor clearance.

## Existing style debt

The style baseline retains 16 cross-file selector collisions, 13 off-scale font entries
and two custom Stronghold listboxes. These are inventory/maintenance debt, not 31 proven
visible failures. Some entries represent specialized media/game typography or conditional
full-screen rules. They are not new design examples to copy. The audit continues to reject
new violations and stale exceptions; no baseline was enlarged for this work.

Follow-up ownership: consolidate a collision at its shared or feature owner when changing
that family, verify its real states, and reduce the baseline. Do not remove scoped game/map
behavior solely to make the number smaller.

## Verification record

- TypeScript and the local production build completed successfully (848 static pages).
- 46 focused application checks cover UI tokens, CSS module references/usage, stylesheet
  assets, base-account markup and the layout-census structure.
- The initial Story/credit browser run passed 30 checks, with two desktop-only cases
  intentionally skipped on phones.
- `check:styles` and `audit:styles` pass without adding baseline exceptions.
- The browser bundle audit found no game-data table in 109 browser chunks.
- The complete production-mode layout census passed 259 checks, with 23 intentional
  skips. It covers both desktop/mobile projects, dark/light variants and driven states.
- After the final name-case and credit-spacing polish, a rebuilt production preview
  passed 70 affected-page checks (four intentional skips): directory layouts/records,
  credit filtering, Story map/list/chapter interactions and reading-progress transfers.
- The full two-width census's accepted-inset records were checked for stale baseline
  entries; every non-optional accepted inset is still present.
- Application lint completed with no errors and nine existing warnings (under the
  repository's limit of 15); changed application and audit files lint cleanly.
- The follow-up Story navigation change (List beside the reader links, no Map button)
  passed 27 Story application tests and 26 desktop/mobile browser checks, with two
  intentional skips. The production build and style/type/lint checks also pass.
- Further feedback changed the Story labels/order, consolidated the Base toolbar and
  added Schedule history. The rebuilt application passed 66 affected desktop/mobile
  browser checks (six intentional skips), including past-event links, chronological
  ordering, shared archive URLs and the archive's layout-census state. All 21 focused
  application checks passed; typechecking, changed-file lint and style audits pass.
- Navigation follow-up: page Back and browser Back restore scroll through progressively
  loaded Schedule history; the artist-to-operator journey also retains its position.
  Schedule's period selector stays above the count and disappears in Calendar.
  The rebuilt application passed 19 desktop/mobile browser checks (one intentional skip),
  including both themes in the Schedule layout census. Four page-trail/archive application
  checks, changed-file lint, TypeScript and style audits pass.
- The final Schedule layout uses a fixed Upcoming/Past selector with the count and
  ordering underneath. Thirteen browser checks pass (one intentional skip), including
  identical bounds for both options when switching, archive Back navigation and dark/light
  layouts on desktop/mobile. The production build, changed-file lint and style audits pass.
- The broader interaction/sticky-controls review passed the complete layout census:
  261 checks, 23 intentional skips. All 91 targeted catalogue/filter/Story/Schedule/
  continuity checks passed (five intentional skips), alongside 32 populated Community/
  Reward Tracker checks (eight intentional skips) and 30 application/token/census checks.
  Scrolled captures cover eight route families at both widths in both themes. TypeScript,
  production build, lint and style audits pass without expanding baselines. Every accepted
  stack inset remains present in the complete two-width census. The census now recognizes
  the header's sticky extension while still measuring its actual controls and content edges;
  the reward action check leaves room below the sticky navigation before pressing it.

Local packaging limitation: the Windows production build's separate deployment-trace audit
reports local `data/` files in server traces despite the existing exclusions in
`next.config.js`. The build and browser-bundle check succeed. This review does not certify
that local output for deployment; the repository's normal CI deployment checks remain a gate.
No deployment, DNS or account-service configuration was changed.
