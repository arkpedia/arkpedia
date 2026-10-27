# Navigation and account redesign plan

Status: implemented locally on PR778; preview/release acceptance pending, 2026-10-25.
This records the target experience, implementation and remaining acceptance work. Infrastructure migration remains tracked separately in
[system simplification](system-simplification-plan.md).

## Direction

Make Arkpedia cleaner, easier to scan and more comfortable on wide screens while
retaining its Rhodes Island identity: restrained teal, dark/light theme tokens,
Rajdhani headings, Inter prose, monospaced facts, compact controls and quiet borders.
Prefer a clear hierarchy and fewer competing actions over adding decorative panels.

Keep the existing design system and shared components as the foundation. Extend
their documented contracts when necessary rather than creating a second menu,
dialog, tooltip, avatar or page-header system.

## 1. Width and responsive layout

The current shared frame and navigation are intentionally capped at1040px; a
1320px `.main-wide` already exists. This keeps navigation and content aligned and
limits scanning distance. It is not a requirement for mobile responsiveness.
The navigation CSS records a previous trial of a wider bar, so this is a deliberate
new design decision rather than a broken responsive layout.

Prototype these targets before changing global tokens:

| Context | Proposed target | Purpose |
| --- | --- | --- |
| Shared navigation and ordinary page frame | Fluid width, capped at1320px | More useful desktop room with aligned page headers/content |
| Reading text inside a page | Approximately60–75 characters per line | Comfortable prose without stretching paragraphs across the full frame |
| Dense planners, maps and comparison workspaces | Wider opt-in frame, up to1600px where useful; existing full-screen tools retained | Use available space for actual information |
| Phones/tablets | Fluid frame and existing gutters; collapse navigation when it no longer fits | Preserve usability without shrinking every label |

These numbers are prototype choices, not universal rules. Review at360,390,768,
1024,1440 and1920px, plus zoom/short viewports. Match page-header and content edges.
Keep prose narrow inside a wide page. Avoid stretching cards merely to fill space,
unbounded text lines, page-level horizontal overflow or a second navigation row.
Update the frame tokens, sticky controls, mini-player clearance and page-bounds
expectations together after visual acceptance.

## 2. Header and navigation

Desktop order:

`Brand | Database · Guides · Planner · Community · About · Schedule | Search | Settings | Server time | Account`

Preserve the current destinations and grouping unless explicitly moved below.
Search moves immediately to the left of server time. The clock remains stable as
its numbers change. Settings and Account have separate jobs and stable hit areas.

| Surface | Target behavior |
| --- | --- |
| Community menu | Keep **Community projects** and existing community destinations; personal account and Friends links live in the profile dropdown |
| Planner menu | Keep planning tools; move My account to the profile dropdown |
| Database menu | Ensure Techniques, Synergies and Obtain method are real destinations in the shared desktop/mobile registry |
| Gear button | Open a labeled Settings dropdown containing Import / export and Appearance |
| Appearance | Move the current Suzuran light/dark control here, with an explicit label and selected state |
| Account button | Replace Suzuran's current header position with a generic Login/profile control, or the selected catalogue avatar when signed in |

The existing main navigation registry does not currently list all three reference
destinations, even though the screenshots describe that intended arrangement.
Treat adding/verifying those links as a prerequisite to removing their operator
index shortcuts. Keep one shared navigation registry for desktop and mobile.

On small screens retain Search, Settings and Account access through the shared
mobile navigation/drawer. Prefer fitting or moving the clock before shrinking touch
targets. Do not solve crowding with several extra floating buttons.

### Settings dropdown

- **Import / export** opens the existing DataDialog, preserving Game import,
  Backups and Browser data and their current behavior.
- **Appearance** exposes the labeled Suzuran light/dark control. Preserve instant
  application, reload persistence and existing consented synchronization.
- Keep destructive account operations and data deletion in their existing named
  settings dialogs, with their current confirmation requirements.
- Opening a dialog closes the originating menu. Closing it restores focus to the
  appropriate trigger, with predictable Escape and keyboard behavior.

### Account dropdown

Show a clear identity/loading state with Profile, Pull history, Operators, Skins and Friends.
Profile opens `/account`; collection shortcuts open that page's corresponding tab.
Friends opens `/friends`. Keep both account and Friends discoverable in global search.

Signed-out readers get a Login action where providers are configured. Local imports,
archives and collections stay available without cloud login.

## 3. Account page and pull history

Use one inline content area with **Profile**, **Pull history**, **Operators** and
**Skins** tabs, in that order. The Profile tab contains the imported game profile.
URL-backed selection (`/account?panel=pulls|operators|skins`) supports direct links,
reload and browser Back/Forward. Switching tabs never reloads the document or stops music.
Collections reuse FriendCollection's filters and cards in an inline mode; friends keep
their existing collection dialogs. Operator detail previews remain dialogs.

Place **Import / export** and **Account settings** together in the page header.
These are overlays of the current page: opening and closing them preserves its URL,
filters, selected tab and scroll. Header Settings can open either overlay from any
page. Load import tables only on demand from the deployment's account props, scoped
to their matching content release, rather than adding game tables to every route.
Account settings owns the avatar picker, username, linked logins, saving preferences
and existing explicit deletion confirmations. Avatar preference remains browser-only.

Retain server/account selection, every archived draw, banner grouping, filters,
statistics, CSV export and empty/loading/error states. Changing a selected server
updates the correct history namespace without mixing accounts.

### Sync status and supporting information

Remove the large **Sync now** button from the normal ready-state layout. Automatic
saving remains the default. Show a compact **Saved**, **Saving…**, **Offline**,
**Saving paused** or **Needs attention** status. Details can show the last successful
save, enabled categories and an optional **Check for updates** action. Keep the
existing refresh capability and recovery paths; this is not a sync-protocol change.

Errors need visible Retry/recovery actions. Consent choices, cloud/browser conflicts,
destructive confirmations and unsaved changes remain explicit. A neutral saved
indicator must not hide a stopped or failed sync. Announce meaningful status changes
accessibly without continuously announcing timer updates.

Move secondary explanations into labeled info popovers or structured details:

| Information | Presentation |
| --- | --- |
| Latest import and cloud-save dates | Compact metadata; fuller timestamps in details |
| Why imported game data is saved/browser-only | Saving-details popover or settings summary |
| Yostar's90-day window and archive limits | “About pull history” info popover; show an actionable warning inline when relevant |
| Current error, paused saving, conflict or consent decision | Visible status and action, not hidden behind an info icon |

Info buttons must work by click/tap and keyboard, have specific accessible names,
close with Escape and return focus. Longer content or links use a popover/dialog,
not a hover-only tooltip. Keep essential information discoverable without hover.

## 4. Catalogue profile pictures

Add **Profile picture** to profile editing. Offer searchable, lazy-loaded categories
from Arkpedia's trusted asset catalogues: operators, enemies, factions, UI elements
and other available icon families. The goal is access to available icon assets,
not a small hard-coded operator-only picker.

- No uploads, pasted image URLs, external image fetchers or arbitrary file paths.
- Persist a stable catalogue identifier; resolve it through the trusted asset
  delivery layer and validate allowed IDs on every persistence boundary.
- Show preview, selected state, Apply/Cancel and reset to the default avatar.
- Use consistent image fitting/backgrounds for transparent art and white glyphs in
  both themes; avoid distorted portraits or unreadable faction marks.
- Fetch only visible picker thumbnails. Do not load the entire image corpus when
  the header mounts. Missing/retired assets fall back safely without breaking login.
- Keep signed-out/local selection functional. Agree cloud-profile persistence with
  the accounts owner before changing profile schemas: old clients must tolerate the
  optional field, current consent behavior stays intact, and no existing profile,
  provider identity, archive revision or encryption key is reset.
- Selecting an avatar does not automatically publish an account/profile or add a
  public social profile. Friend-file sharing remains an explicit existing action.

## 5. Community projects

Add `/community/projects` using the shared PageHeader and directory-card language.
Start with **Arkpedia Desktop Chibis**, a concise description and a clear
**Latest release ↗** link to:

<https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest>

The latest published non-prerelease was verified asv0.7.0 on2026-10-25. Use the
stable latest-release destination so new versions need no website code change.
Link to the project repository separately if useful; show supported platforms only
when verified from release metadata. Do not auto-download, run software or require
a GitHub API request on every visit. Use a small data-driven project list that can
grow with real community projects.

“Friends” continues to describe the existing imported-friend functionality; this
navigation change does not introduce friend requests or a new social backend.

## 6. Reference navigation and page headers

- Remove the three large Techniques/Synergies/Obtain method cross-link buttons from
  `pages/operators/index.tsx` after Database navigation is present on desktop/mobile.
  Preserve useful operator-specific skill/mechanic links and actual reference content.
- Standardize page introductions with PageHeader, one h1 and the same mono eyebrow:
  **RHODES ISLAND // SECTION**. Keep actual breadcrumbs separate where helpful.
- For the screenshot example use **RHODES ISLAND // SKILL EFFECTS** above **TECHNIQUES**.
  Apply the same pattern across other directories and new community/account surfaces.
- Audit all page families for consistent spacing, hierarchy, control sizes and
  supporting-information treatment. Do not flatten tables/maps/workspaces into cards.

## Implementation order and acceptance

- [ ] Prototype the wider shell and desktop/mobile header; review before global rollout.
- [x] Implement shared navigation, gear menu and capability-aware account menu.
- [x] Add Community projects and move My account/Friends navigation.
- [x] Share account overlays without route navigation; use URL-backed inline account tabs.
- [x] Simplify sync/status/help presentation while preserving all recovery/consent flows.
- [x] Add the trusted asset picker and reviewed backward-compatible avatar persistence.
- [ ] Normalize headers, remove redundant operator-index shortcuts and review all page families.
- [ ] Verify the complete affected journeys in an isolated preview, then release through main.

Acceptance includes dark/light, narrow/desktop/ultrawide, keyboard/touch, zoom,
loading/empty/populated states, menu/dialog focus restoration, Back/Forward and scroll,
music continuity, selected server, local-only use and real configured cloud-account
behavior. UI changes must not lose or duplicate archived draws, change consent,
upload remembered game credentials or silently replace personal saves. Use synthetic
fixtures in CI and keep any owner-assisted private evidence out of artifacts.

Run focused checks while iterating. Use the existing impact-selected validation and
checked-source preview flow; do not add a separate full-site crawl for every small
visual iteration. Record which checks actually ran. A screenshot or a passing HTTP
request alone is not evidence that account/sync/dialog journeys work.

## Reference and implementation ownership

Current owners: `styles/core/shared.css`, `styles/core/nav.css`,
`components/layout/Sitenav.tsx`, `lib/nav/navLinks.ts`, `ThemeToggle`, `ServerClock`,
`SiteSearch`, `PageHeader`, `DataDialog`, `CloudAccountPanel`, `AccountProfileForm`,
`PullHistory`, `ProfileCard`, `FriendCollection` and the content/asset helpers.
Coordinate account/schema work with the accounts owner before implementation.

Read alongside [design system](design-system.md), [UI primitives](ui-primitives.md)
and [UX review](ux-review.md). Readability guidance supports bounded prose inside
wider layouts: [USWDS typography](https://designsystem.digital.gov/components/typography/).
Help content must be perceivable and dismissible with keyboard/touch, following
[W3C hover/focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus).


## Implementation notes — 25 October 2026

Implemented on PR778: wider 1320px shared shell; dev-style Database/Guides/Planner/
Community/About grouping with database dividers and Manga; requested Community
projects placement and profile-dropdown account/Friends links; Search/settings/clock/profile order; browser
profile icons in Account settings; inline account tabs and page-preserving overlays; compact sync/help; and
reference header cleanup. Dev-only route renames were not imported.

Account-owner review identified an old-client sync payload incompatibility for a
new personal key. Avatar persistence therefore remains explicitly browser-only,
outside cloud saves and browser backup schema. Cross-device avatar saving remains
a follow-up requiring capability/version handling and old PUT preservation.

Acceptance checkboxes above stay open until the corresponding review and preview
journeys pass. Implementation is not a claim of release or full-site acceptance.

The next music revision implements the approved full workspace direction, inspired
by Navidrome while retaining Arkpedia's style and existing playback/data contracts.
See [Music workspace](music-workspace.md) for its navigation, player and verification scope.
