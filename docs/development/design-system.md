# Arkpedia design system

Status: maintained product reference. Applies to every public page, development tool,
embedded view and future feature. Updated 2026-10-23 following the site-wide review.

Read this before designing a page. [UI primitives and tokens](ui-primitives.md) is the
implementation specification; it owns exact tokens, component APIs and regression rules.
Do not invent a second palette or copy a feature's CSS as a new standard.

## Product character

Arkpedia is a readable Arknights reference and planning workspace. Its visual identity
comes from restrained Rhodes Island styling: a quiet background, compact square controls,
clear display headings, useful imagery and small monospaced facts. Content should be
easier to scan than the interface around it.

Consistency means that the same task has the same presentation and interaction. It does
not mean turning a chronological schedule, a stage map and a music queue into identical
cards. Choose the pattern below first, then use its established primitives.

## Navigation and continuity

- Browser Back/Forward and a page's Back link return readers to their previous scroll
  position, including content revealed by progressive lists. Ordinary links open the
  destination normally. Do not reset a returning reader to the top of a catalogue.
- Keep controls beside the heading or content they affect. Controls for a hidden view
  must disappear from both the screen and keyboard navigation.
- Name each view explicitly. Schedule uses a fixed Upcoming/Past selector above the
  event count and list, while Events/Calendar selects the presentation.
- Verify the complete browse → detail → Back journey on desktop and mobile, including
  a record beyond the initial list batch. Check browser Back as well as the page link.
- Carousel dots are grey (`--text-dim`) when unselected and coloured (`--teal`) only for
  `aria-current="true"`, matching the homepage Community section. Status such as an upcoming
  or closed event belongs in its label and countdown, not an unselected navigation dot.

### Persistent browsing controls

Use `StickyControls` for compact search/filter bars and local view choices on long lists.
For catalogue controls in `PageHeader`, opt into `stickyActions`; it keeps the controls
in the page frame, following the title, so the header does not limit their sticky range.
The shared component follows the measured site navigation height, draws an opaque theme
background and stays below menus and dialogs. It also reserves anchor scroll clearance.

- Keep one sticky toolbar per browsing context. Do not pin the page title or stack another
  bar over an existing sticky workspace/section header.
- Pin only compact bars: controls at most 176px, and the whole bar including padding at
  most one quarter of the viewport height. Below a
  480px viewport height, or when controls grow beyond that limit, use normal document flow.
  Mobile catalogue filters remain in the shared Filters sheet.
- Keep both options mounted when switching views. Changing results, counts or active
  filters must not move the toolbar, clamp the page upward or reset its query.
- Preserve selected browsing sections/searches in the URL. Community Hub uses `section`
  and `q`; Reward Tracker uses `view`. Session-only simulation/game state is separate.
- Test scrolled controls, short viewports, keyboard/menu interaction, dark/light themes,
  and Back navigation. A clean first screen alone does not verify this behavior.

## Foundation

| Element | Rule | Implementation owner |
| --- | --- | --- |
| Page frame | 1040px maximum; 24px gutters; header and content share a left edge | `styles/core/shared.css` |
| Page introduction | One h1, mono eyebrow, optional concise description, page controls below | `PageHeader` |
| Type | Rajdhani for display and buttons; Inter for prose; JetBrains Mono for facts and labels | `_app.tsx` and shared tokens |
| Hierarchy | Page title 30px desktop/24px phone; section 18px; card name normally 18px; metadata 10–13px | Global heading rules and `.entity-title` modifiers |
| Spacing | Section gap 36px; heading-to-content 14px; card inset 12px; grid gap 12px | `--section-gap`, `--heading-gap`, `--card-inset` |
| Shape | 2–4px radii, from tokens | `--radius`, `--radius-frame`, `--radius-control` |
| Controls | One row height: 36px desktop, 40px at ≤720px; use the token rather than a literal | `--control-h`, shared primitives |
| Themes | Every surface, text, state and border follows dark/light tokens | `styles/core/shared.css` |
| Motion | Quiet feedback; no layout movement; reduced-motion support | `styles/core/motion.css` |

Use `--heading` for section headings and `--teal` for interactive states. The current theme
aliases the heading color to teal; their semantic roles remain separate. Do not add teal
frames to neutral information to make it feel important. Use `--amber` for warnings/costs,
`--danger` for errors/destructive meaning, and rarity/category tokens for game data.

## Choose a content pattern

| Reader's task | Pattern | Examples |
| --- | --- | --- |
| Find an operator, outfit, enemy, album or video by its appearance | Image-led catalogue; imagery determines tile proportions | Operators, skins, enemies, music discovery, community videos |
| Browse named people, mechanics or groups | Reference directory cards with a title, short facts and relevant operators | Artists, voice actors, techniques, synergies |
| Scan many comparable records or change their order | Rows or a table with aligned columns | Music tracks, search results, recruitment results, account history, poll statistics |
| Compare structured content at a glance | A table with actual headers and clear units | Operator stats, costs, reward breakdowns |
| Understand order, time or spatial relationships | Timeline, calendar, map or board; keep an accessible searchable alternative | Schedule, Story, stages, base facilities |
| Build a plan or operate a tool | A stable workspace of labeled panels and compact controls | Operator/pull/skin planners, recruitment, base optimizer |
| Read editorial/reference information | Sections with headings and prose; lists for citations and parallel facts | Credits, support, What's new |
| Play a game or use a companion | Purpose-specific play area inside the shared shell, unless explicitly embedded | Guessers, palette game, Stronghold companion |

### Reference directories

Use `.directory-grid` and `.directory-card` from `styles/core/arkpedia-theme.css`.
The grid fits three cards into the normal desktop frame and collapses as space requires;
its minimum column width is capped by the available width, so narrow phones cannot overflow.
Use `.directory-grid-wide` when the content genuinely needs a wider composition, as manga
covers with their chapter links do. Features own the content layout inside each card.

- Lead with the entity name; keep counts and language/category labels secondary.
- Card names use `.entity-title.entity-title-sm.entity-title-name` (18px, original case).
- Use the same surface, inset, radius and grid rhythm across directory families.
- Show useful operator links immediately on artist and voice-actor cards. Retain alphabetic
  grouping, search, filters and the complete credits; do not hide everything behind accordions.
- A card that opens a record is one real button (`.btn-bare`) with `aria-haspopup="dialog"`,
  or a real link when it navigates. It may use `.lift`.
- A card containing independent operator links is a static grouping. Do not make the whole
  card another button or link, and do not lift it as if it could be pressed.
- Picture/content cards have a transparent resting border. Interactive cards gain a teal edge
  on hover and keyboard focus. Static cards do not advertise a click.
- Display only genuinely brief descriptions on browse cards; detailed mechanics belong in
  the record. Preserve real names, numerical conditions and accessible full detail.

### Dense rows and tables

Rows are appropriate when the reader compares repeated facts or works through a sequence.
They are not a competing design language. Use the same heading, text, control and state
tokens as cards. Align corresponding fields. Preserve text labels on a phone, and contain
wide tables inside their own scroller rather than widening the page.

### Maps, calendars and workspaces

Put the content/view choice above the tool it selects, separate from zoom, Fit, full screen
and other tool controls. Keep search and filters visible in a list view. A view choice should
have a clear label and readable hit targets without becoming the page's largest content block.

On Story, the compact reading controls are ordered Full List, Manga, then Timo's reader.
The page opens on the section titled "Story map", with no Map button. Full List toggles the searchable catalogue
in place ("Story list"); pressing it again returns to the map. The map toolbar operates
only the map. The list keeps all story categories, search, reading progress and chapter
links. The `view` query parameter remains shareable.

Schedule uses the shared Upcoming/Past segmented selector, with both labels always
visible in fixed positions. Place the event count and ordering beneath it (soonest first
for Upcoming, newest first for Past). Do not duplicate the selected option in another
heading or changing navigation button. Calendar hides the period selector.
The Events/Calendar tabs select presentation separately. The archive
shows confirmed, finished events from newest to oldest, linking to each event page;
predicted dates and headhunting-only entries are not historical stage events. Its
`?past=1` address is shareable, and Upcoming restores the normal list.

The Base planner keeps Save image, Edit layout and the Your plan/Imported account
choice in one toolbar. On narrow screens this row scrolls within the page. The
formation action is "View base"; editing an existing formation uses "Apply Layout".

Workspace panels may have passive outlines and depth; a card inside a panel does not need
another panel frame. Keep toolbars stable when filters, tabs or selections reduce content.
Use `useSwitchHold` or `useHeightFloor` where appropriate; never move focus just to style a state.

## Navigation and actions

| Meaning | Use | Avoid |
| --- | --- | --- |
| Move to another URL | `Link`/`a`; route tabs have `aria-current="page"` | A button that behaves like an unlabeled link |
| Switch sections of one record | `Tabs` with its matching panel props | Hand-built tab markup/paint |
| Choose a filter or representation | `SegmentedControl` for pick-one; `.filter-chip` for independent filters | Solid primary fill for the active choice |
| Toggle a preference | Labeled `.check` checkbox | A chip pretending to be a checkbox |
| Run the main action | `.primary`; use sparingly | Several unrelated primary buttons competing |
| Secondary action or destination | `.ghost`, sized by the shared primitive | Oversized promotional panels for ordinary links |
| Remove/delete/reset | Clear verb; `.danger` when destructive; `XButton` for an icon-only close/remove | An unlabeled × or a custom close hit area |
| Search or choose from a menu | `SearchInput`, `StyledSelect`, `SuggestMenu` | A new native dropdown or listbox implementation |

Buttons use uppercase Rajdhani with the shared tracking. Ordinary links and prose keep
normal sentence case. A label's accessible name must include its visible text. External
destinations show ↗; a link opening a new tab uses `rel="noopener noreferrer"`.

Pick-one groups and tabs begin on the section's left edge, at content width. Do not stretch
every filter to fill its row. Give important navigation its own position in the page
hierarchy rather than increasing every control's size.

## Page anatomy

1. Shared navigation and skip link.
2. `PageHeader`, as a sibling of `main`, with a section-specific eyebrow and one title.
3. Optional page navigation, search and filters, grouped by purpose.
4. A result count or short explanation where it helps the reader.
5. Main content using the chosen pattern and `.op-section` for real sections.
6. Optional detail dialog; use the shared dialog frame, focus handling and scroll behavior.

Keep counts live and specific: distinguish filtered results from the full catalogue. Empty
results explain what happened and offer an available recovery action. Loading, success,
empty and error are distinct states. `.notice` is a neutral tool message; `.notice-danger`
marks an error. Use the shared `.meter`/`.meter-fill` for progress and expose its value to
assistive technology. Keep essential information outside color alone.

## Responsive and accessible behavior

- Desktop and phone layouts carry the same hierarchy and core functionality.
- At ≤720px, large filter sets use `FilterSheet`; search remains accessible.
- Cards reflow; names and facts wrap. Never set a column minimum wider than its container.
- Preserve every operator/credit/story link, keyboard operation, clear focus, query state,
  and saved reader state during a visual refactor.
- Full-screen tools restore normal page flow and scrolling when closed.
- Dialogs have a name, a reachable close button, Escape behavior and focus restoration.
- Images use `ContentImg`/`ContentImage`, correct alt text, and reserved dimensions. Only a
  measured page hero uses eager priority. Decorative art has empty alt text.
- Respect reduced motion. Hover cannot be the only way to discover information.
- Review at 1440px and 390px in both themes, plus narrow/long-content cases. Global page
  overflow, inaccessible menus and overlapping fixed players/navigation are defects.

## Site-wide pattern inventory

This inventory is also the starting point for reviewing a new route. Dynamic routes need
a real representative record; empty tools need a populated state as well as the first paint.

| Family | Routes / surfaces | Shared language, intentional specialization |
| --- | --- | --- |
| Home | `/`, `/home` redirect | Editorial panels, image-led event/banner/operator cards |
| Operator reference | `/operators`, `/operators/[name]`, `/skins`, `/enemies` | Shared search/filter shell; artwork cards and detailed records |
| Reference directories | `/artists`, `/voice-actors`, `/synergies`, `/techniques` | Shared directory surfaces, titles, metadata and operator imagery |
| Story | `/story`, list/query/chapter states, `/manga` | Compact links, separate view choice, map tools, searchable story rows and comic cards |
| Planning | `/planner`, `/pulls`, `/skin-planner`, `/selector-tickets`, `/free-op` | Shared tool shell, labeled panels, selections, tables and material tiles |
| Recruitment | `/recruitment`, `/recruitment/popout` | Same RecruitmentTool; popout intentionally omits site chrome |
| Base | `/base`, room/rotation states, `/bases/whole-base-optimizer`, `/optimizer` | Spatial facility board and calculation panels; last two tools are development-only |
| Schedule/events | `/schedule`, `/events` redirect, `/events/[slug]` | Time-based rows/calendar and sectioned event records |
| Terminal/stages | `/stages`, `/stages/all`, `/stages/browse`, `/stages/content/[id]`, `/stages/regular`, `/stages/seasonal`, `/stages/score`, `/stages/exploration`, `/stages/supplies` | Shared Terminal navigation and panels; map, stage cards and aligned reward data |
| Game modes | `/gamemodes`, `/gamemodes/stronghold-protocol`, `/gamemodes/stronghold-protocol/stronghold-companion` | Standard page shell; companion is intentionally a dense full-bleed play aid |
| Logistics | `/farming`, `/obtain-method` | Material references and search/filter results, not decorative directory cards |
| Music | `/music`, `/music/discover`, `/music/[albumId]` redirect | Album artwork for discovery; aligned song rows, shared player and queue controls |
| Community | `/community`, `/community/videos`, `/community/youtube-live`, `/community/twitch` | Shared subnavigation; media cards and live/status labels |
| Account/social | `/account`, `/friends` | Profile panels, account tabs, history rows, operator/skin previews |
| Games | `/games`, `/games/operator-guesser`, `/games/stage-guesser`, `/games/recruitment-guesser`, `/games/music-guesser`, `/games/color-palette` | Shared game navigation and controls, task-specific play areas |
| Statistics | `/polls/power-scale` | Charts and sortable tables; data colors retain meaning |
| Information | `/search`, `/credits`, `/support`, `/whats-new` | Search rows or readable sections; support options remain purposeful action panels |
| System/development | `/404`, `/500`, `/dev`, `/dev/ui` | Same header/control system; UI gallery documents reusable primitives |

## Ownership and maintenance

- Product patterns and this route inventory: this document.
- Exact tokens, component APIs, interaction rules and exceptions: [UI primitives](ui-primitives.md).
- Shared appearance: `styles/core/`; reusable behavior: `components/ui/`.
- Feature-specific arrangement: its stylesheet/module. Do not restate shared button, card,
  heading, menu, dialog or state paint there.
- A new shared pattern must have a real consumer, accessible semantics, documentation and
  visual verification. Add it to the shared owner instead of copying it into several features.
- Keep intentional exceptions named and justified. A baseline suppresses known debt; it is
  not permission to copy that debt. Shrink it when an exception is removed.

## Before a design change ships

Run typechecking, application and affected interaction tests, lint, `check:styles` and
`audit:styles`. Run the existing `layout-census.spec.ts` on desktop/mobile for broad shared
changes: it covers bounds, headings, spacing, controls, links, cards and driven states in
both themes. Run the affected dialog/tab/filter/motion tests when those behaviors change.
Verify screenshots as well as measurements; a green geometry check cannot choose the right
content pattern. Do not add a second test suite that reloads every census route.

Record what was actually reviewed and any blocked coverage. The dated
[2026-10-23 review](design-review-2026-10-23.md) separates design decisions, fixes and
verification limits. Update these references when a new pattern is accepted.
