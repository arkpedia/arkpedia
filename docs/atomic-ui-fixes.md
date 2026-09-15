# General UI and technique fixes — September 9, 2026

This branch lifts the general UI correction from `56595eae` onto main
`925beb9d`: expandable Music Discover collections and their old-URL redirects,
community feed availability messages, the legacy livestream redirect, readable
mobile Calendar/Support layouts, the native Support dialog, and consistent
Events/Music/Support card treatment. Existing Music Discover data loading stays
on main's implementation; no Song Guesser or music-player features are included.

The duplicate Wishlist surface fix is owned by the separate light-mode branch.
This branch has no shared theme palette, glyph replacement, stage theme work,
held Planner/Pull Planner feature, or operator-release scheduling changes.

Technique and synergy correctness is transferred from `69063da4` into this
branch, with both final implementation modules preserved byte-for-byte. These
fixes prevent operator names from being treated as statuses, prevent unrelated
skill levels/sentences from creating stat/ordered-keyword matches, preserve
healing with decimal amounts, and resolve full bracketed faction names without
losing Glasgow or falsely matching short editorial notes. They apply to both
the Techniques page and operator profiles through their existing shared helpers.

Eight focused regression tests cover those failure cases and the valid matches
that earlier fixes had accidentally removed. They run in their own workflow.
The UI and technique changes require no other feature branch.

Fresh extraction checks passed: all eight technique regressions, TypeScript,
full lint within the existing warning cap, strict rendered-class validation,
whitespace validation, and a complete production build of 632 pages. Five of
these regressions fail against main's previous technique implementation; all
eight pass with the preserved corrected modules. Generated enemy/stage details
were reused from the completed release-branch build after checking generator
and helper parity; the application itself was built fresh.

The optional `audit:styles` reports four pre-existing findings (the shared
`eyebrow` selector and three off-scale font sizes). Its baseline was not relaxed.
Existing unrelated lint and page-data-size warnings remain. Earlier screenshots
and broad site-sweep reports are historical; this extraction does not claim a
new full-site visual sweep.

The only prerequisite is shared class-check correction `dd91a2d7`; the branch
requires no Planner, Guesser, Music, Games, or light-mode feature branch.


Focused production browser checks passed in Firefox at 1280px and WebKit at
390px, in both themes (four contexts). They cover Discover expansion/collapse,
the Support dialog and restored focus, and 308 redirects for the old livestream
and Discover collection URLs. Representative screenshots were inspected; no
browser runtime errors occurred. This is focused UI verification, not a full
website sweep or an external streaming test.


## Stage interaction follow-up

Tile details now close on blank map space as well as clicks outside the map;
pressing inside the details keeps them open, and another tile switches them.
Route and animated enemy overlays no longer intercept placement/tile clicks.
Escape clears both the armed operator and active drag state; pointer cancellation
and loss of window focus cancel a drag instead of completing a stale drop.
The drop uses its release coordinates, and the same tile eligibility rule now
drives hover highlighting and placement. Clicking an armed portrait again
deselects it. Starting placement closes tile/legend overlays.

On `/stages/browse?s=1-7`, browser checks covered blank-space and outside
dismissal, clicking popup contents, Fang placement through visible routes,
direction selection, retreat, direct drag-and-drop, rejecting a ground
operator on high ground without a ghost, Escape, portrait toggle-off, and
Clear. Desktop (1280px) and mobile (390px) interactions passed with no console
errors or horizontal overflow. Pointer-cancel and blur cleanup were reviewed
in code; browser interruptions were not artificially injected.

Source and dev typechecks and production builds passed. Source lint and the
strict rendered-class check passed; existing unrelated warnings remain.
The rebuilt dev production preview also passed the blank-map dismissal check.
