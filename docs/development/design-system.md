# Arkpedia design system

Status: maintained product reference. Applies to every public page, development tool,
embedded view and future feature. Updated 2026-10-23 following the site-wide review.

Read this before designing a page. [UI primitives and tokens](ui-primitives.md) is the
implementation specification; it owns exact tokens, component APIs and regression rules.
Do not invent a second palette or copy a feature's CSS as a new standard.

The [navigation and account redesign plan](navigation-account-redesign-plan.md)
records the maintainer's2026-10-25 target for a wider shell, clearer navigation,
account shortcuts and quieter supporting information. It is the next product design
plan; its proposed widths and new components are not yet implemented. The current
token values below remain factual until the prototype is reviewed and updated.

## Product character

Arkpedia is a readable Arknights reference and planning workspace. Its visual identity
comes from restrained Rhodes Island styling: a quiet background, compact square controls,
clear display headings, useful imagery and small monospaced facts. Content should be
easier to scan than the interface around it.

Consistency means that the same task has the same presentation and interaction. It does
not mean turning a chronological schedule, a stage map and a music queue into identical
cards. Choose the pattern below first, then use its established primitives.

## Navigation and continuity

Public URLs use their current reader-facing names: `/reward-tracker`,
`/operator-planner`, `/pull-planner`, `/game-modes`, `/gacha-simulator`,
`/polls/power-scale`, `/whats-new` and `/world`. Old bookmarks redirect directly;
in-app links and published-search results target the canonical page. Internal content
release keys remain stable so renaming a URL never invalidates existing content.

Operator previews opened from an account or friend roster use that selected roster's
recorded promotion, level, skill ranks, masteries and unlocked module stages. Never
substitute the viewer's planner build for a friend's build. Keep reference previews
at their reference defaults, label missing build data, and identify stat assumptions
such as estimated trust. Resolve private build values locally from public game data.

The homepage Twitch feature and live directory verify streams independently of static
page releases. Refresh visible pages every 30 seconds and on tab return/focus; remove
unconfirmed streams after errors or inactivity. Only live entries in the Arknights
category qualify. The live endpoint shares results for 15 seconds within a server
instance and disables browser/CDN caching, including stale-while-revalidate.

The homepage has one YouTube slide alongside its stream and event slides. Each carousel
round selects a different creator's video in that slot; hover/focus pauses rotation.
Stack the alternatives inside the slot to reserve the tallest caption without extra dots.
The candidate pool prefers active Global event guides, currently obtainable
operator showcases and currently available outfits, including older uploads. Remaining
choices use the newest upload per channel within 48 hours; when nothing qualifies, fall
back to the three newest available channels. Keep one video per creator in the rotation.
Keep the last successful public feeds through temporary upstream failures, independently
of that editorial window. World’s YouTube tab groups uploads by conservative title rules,
with ambiguous titles in Other. Relevant current content precedes newer unrelated videos;
the matching Global window’s exclusive close removes its priority. CN and future-content
uploads remain included. Both views retain search/category choices in the URL.
Show publication dates when known and Archive otherwise; never invent dates for older
indexed guides. The daily content preparation refreshes a bounded, cached metadata archive
from trusted creators and publishes it with World, so reruns can revive older guides.
Video metadata is the `data/youtube-discovery.json` content record, so archive-only
changes produce a new release input. Query dates stay in the job cache.

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

Music uses the same full transport in Library, Favourites, playlists, Now playing and
on other pages. Outside Music it starts hidden behind the music button; playback
opens it automatically. Once open it stays visible through navigation and pauses.
Music pages always keep it open. On other pages, manual minimizing keeps it hidden
across navigation and track changes until reopened, without pausing audio. The expand
and minimize tiles share one bottom-right position and square shape on every device.
On phones the bottom row is Favourite, Block, volume and Stream-safe; secondary action icons change color only on hover and when active, with no frames or background fills; keyboard focus stays visible. The speaker toggles mute and restores the last audible volume. Volume has a speaker icon, with
a brief, translucent percentage and speaker in the screen center, clear of playback controls and the touch point.
More contains Add to playlist, Open on YouTube and the Data saver/Endfield settings; it omits controls already in the transport. Setting help floats without changing menu layout.
Now Playing keeps artwork and track details in one stable column and reserves the lyrics area even for instrumental tracks, anchoring the visualizer at the same position.
Now Playing stays in normal page flow: dragging the artwork does not slide a layer over Library. Use the explicit Back to Library control to change views. Track details grow with their content and scroll with the page.
On phones the lyrics icon toggles a taller lyrics view between the site header and
the transport, keeping the visualizer at the bottom. Its active color marks expansion;
collapsing restores the track details and previous page scroll position.
Queue always opens the shared popup above the transport, preserving the current page,
filters and playback. Legacy `view=queue` links open that popup over a normal Music view.
Queue rises and fades into place; the player and its minimize icon glide in from
the right when opened outside Music. Entrances use the shared motion timings and
are instant with reduced motion. Already visible controls stay steady during navigation.

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

Server-rendered numbers use an explicit locale, matching the English operator stats'
`en-US` formatting. A reader's browser locale must not change the initial text during
hydration. Reader-local formatting needs a stable first render and an intentional
client-side update; it must not depend on the server machine's default locale.

## Choose a content pattern

Welfare recommendations use individual cards with a quiet resting border and a rarity
frame around each portrait. This is an explicit exception to borderless catalogue art.
Put the recommendation priority in the portrait corner, using the Selector Tickets
badge treatment with +3, +2, +1, +0 labels (highest to lowest), preserving kukkikaze's
ordering. Zero is not a negative score; keep names free of inline priority labels. Event links
use the same full-width action treatment as Selector Tickets' How to use links.
Write unlock requirements as actions, such as "Earn 12 stars from event stages",
so star totals cannot be mistaken for operator rarity or recommendation scores.
Stage-reward rows pair remaining OP with successful-clear sanity cost and its actual
sanity icon. Unknown costs stay labeled unknown; zero-cost stages remain zero.

Official event guides use their original post images, preserve their full aspect ratio,
and offer full-size viewing with concise accessible captions. Standalone source links
use shared action styles and an external-link indicator. Project cards show the actual
project or its game models rather than a generic site logo used as placeholder art.

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

What's new uses a single reading column with readable body contrast and descriptions
at 15px, separated by day and Added / Changed / Fixed headings. Dates sit alongside
the updates on desktop and above them on phones; avoid spreading prose across a
multi-column grid.

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
Event detail tabs share the Operators tab’s outer panel, inset and heading divider.
The calendar’s sync action and independent Events/Birthdays toggles stay together at
the right of the calendar toolbar, including when that toolbar wraps on phones.
The Events/Calendar tabs select presentation separately. The archive
shows confirmed, finished events from newest to oldest, linking to each event page;
predicted dates and headhunting-only entries are not historical stage events. Its
`?past=1` address is shareable, and Upcoming restores the normal list.

The Base planner keeps Save image, Edit layout and the Your plan/Imported account
choice in one toolbar. On narrow screens this row scrolls within the page. The
formation action is "View base"; editing an existing formation uses "Apply Layout".

Workspace panels may have passive outlines and depth; a card inside a panel does not need
another panel frame. Cards themselves are flat and matte: one ground, one edge, and the hover
lift as their only shadow ([UI primitives](ui-primitives.md), "Cards are flat and matte"). Keep toolbars stable when filters, tabs or selections reduce content.
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

Saved event reward images use the page's theme and reward totals, with muted event
art behind the title. Category panels carry large game icons, full item names and
aligned quantities. Keep sources and reward provenance in the image so it remains
useful when shared outside the site. The export has the same resolution on phones
and desktop; unavailable artwork must not remove an item or block downloading.

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


## Navigation and account surfaces

The desktop header and mobile drawer use `lib/nav/navLinks.ts`. Keep Database,
Guides, Planner, Community, Extras, Schedule and About in the same order on both.
Community groups Polls, Community Stats and Find support units before a divider, then
Community projects and World. Extras holds Music and Games. Schedule holds Events and Calendar. Database dividers separate operators/reference, world/story, and creators.
My account and Friends shortcuts belong to the profile dropdown; Friends opens the account’s Friends tab. Community projects belongs to Community. About owns site
news, credits and support. Use current canonical routes; do not copy dev-only URL
renames without their routing migration.

Header utilities run Search → Settings → server clock → profile. Phones keep 44px
utility targets; desktop navigation hides its clock below 1100px and its wordmark
below 960px to keep every menu readable. The mobile bar hides its clock and wordmark, with the full clock
still available in the navigation drawer. Settings owns Import / export and the
Suzuran appearance toggle. The profile disclosure owns Profile, Pull history,
Operators, Skins and Friends. Profile opens `/account`; Friends opens `/account?panel=friends` and currently supports manual exported-file imports only. Login appears only when this deployment supports providers.

`ActionPopover` is a non-modal disclosure of native links/buttons, with Tab,
Escape, outside dismissal and route-change dismissal. It mounts inside a containing
native dialog when needed, so help stays usable in the browser's modal top layer.
Escape dismisses help before its parent dialog. Use `InfoPopover` for optional
explanations; validation, consent, conflicts and destructive consequences stay visible.

Account content uses URL-backed Profile, Pull history, Operators and Skins tabs.
Import / export and Account settings open over the current page without navigation.
Account settings owns the profile-picture picker and cloud account controls. Import
loads the deployment’s account props on demand, keeping the release and tables together.
History remains available without an imported game snapshot. Saved status replaces
the large Sync now action; optional checking lives under Cloud saving details.

Profile icons come from the catalogue arkpedia-data's import builds nightly
(`public/profile-avatars.json`, fetched from the live release). It contains published
icon paths, loads only when needed and renders at most 60 initial choices. Every stored ID is checked against the exact catalogue before rendering.
Signed-in pictures save directly to the Arkpedia profile and follow that account
across devices. Guest choices stay browser-only and are not automatically adopted
by an account. Both are separate from imported game and provider identity. Keep
pictures outside BACKUP_STORES/CLOUD_KEYS so older clients replacing cloud saves
cannot erase them. No uploads or arbitrary URLs.

Pull-history banner summaries and batches use bordered panels, with full rarity
frames around portraits. Keep storage help inline beside its status label. Header
ticket icons are monochrome SVG symbols, consistent with the other navigation icons.

Menu notification dots replace the chevron inside its reserved slot; reading updates
must not change the About trigger width or shift neighbouring navigation.

Header Settings and Profile reuse the main navigation's menu surface and item styles,
including mono labels, 19px icons and active/hover states. They remain disclosures,
not ARIA menus. Browser privacy choices live under About and Settings; optional
analytics and external playback default to off. See privacy-review.md before release.

Friends uses compact imported-profile rows with support units and explicit Profile,
Operators and Skins actions. Shared friend files contain only the displayed profile,
collections, owned builds and Main Theme milestone, with no wallet, pull archive,
credentials or unrelated planner saves. Friend files and browser privacy choices do
not silently expand the cloud-save contract.

Compact friend rows reuse the imported name-card background (Rhodes Island by default),
with the same art in both themes and scrim tokens for readable labels and controls.

Friend rows use profile-namecards/<id>-strip[-variant].webp (the game's name_card_long
asset), respecting nameCardVariant. The full profile's -bg artwork is not a row banner.

Info popovers use the shared SVG circle-info icon with a borderless trigger. Prose
links inside help and reading sections keep the shared themed color even when visited.

About, Privacy notice and Privacy choices share InformationLayout: restrained section
headings, a readable text column, desktop contents rail and wrapping mobile navigation.
Privacy options use shared panels and native checkboxes; storage identifiers are bold.
Public privacy copy targets Cloudflare hosting and analytics for this deployment.

First-visit usage-statistics prompts are compact non-modal disclosures with equal-width,
equally styled allow/refuse buttons. Closing means refusal, with no focus takeover or
page reflow. Remember decisions across visits, preserve independent media permission,
and do not duplicate the floating prompt on the privacy-choices page.
