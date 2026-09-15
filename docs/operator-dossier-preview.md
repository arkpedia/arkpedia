# Operator dossier preview

Approved iteration on `preview/operator-showcase` at `1f7f8b4fb`, integrated into `operator-page-update` on top of the original `operator-reference-refinements` commit `2850cf72`.
The original preview stays on port 3177. This worktree uses port 3179.

## Design plan

- Palette: existing deep slate `#0f151b`, panel slate `#18212a`, cool text `#BCC8CF`, teal `#5fd9c6`, light paper `#F1F4F6`, and light-mode stat blue `#235BB5`. Preserve theme overrides and all rarity tokens.
- Typography: retain Rajdhani for operator identity and talent names, Inter for descriptions and controls. No new fonts.
- Layout: artwork occupies roughly 40% of the bounded desktop workspace; a compact identity header, three directly accessible navigation rows, and a combined talent toolbar leave more space for reading. Preserve the reserved ad gutters and mobile deep links.
- Character: use the operator's real faction mark behind the artwork. Outfit thumbnails show the artwork and its name. Decoration stays in the art area.
- Interaction: retain stable talent-card geometry and section state. Label promotion selectors. Add a small, optional illustration for Thorns the Lodestar's lane talent, with an open-lane/wall comparison.
- Follow-up: remove the visible "View artwork" overlay while retaining the zoom cursor, accessible name and keyboard activation. Group each guide title and creator in one text column, with the creator below the title.

```
Operator search
Artwork + faction mark  | Name / class / branch
                        | Overview Skills Stats Talents
                        | Mastery Modules Promotion Potential
                        | Base skills Profile Files Guides
                        | Talents     E0 E1 E2     P1 P5
                        | Talent name / applicable requirement
Named outfit thumbnails | Description / optional mechanics
```

Review against brief: the expressive element is Arknights artwork and game-specific mechanics. Retain the existing product's visual vocabulary rather than introducing a different brand system. Keep all common controls directly reachable. Avoid decorative labels and duplicated explanations.

## Mechanics reference

Potential selectors retain both rank labels and game icons. The missing Potential 1 icon was imported unchanged from `https://raw.githubusercontent.com/Aceship/Arknight-Images/main/ui/potential/1.png` (Git blob `0e870281e1a78d7c0c7312d270cc891bdf9f9802`); Potential 2–6 use the existing local assets.

The lane example illustrates a row or column of at least six consecutive passable ground tiles, interrupted by a wall or high ground; it does not imply six deployed operators are required. The example has no intersecting qualifying column.

- https://arknights.wiki.gg/wiki/Thorns_the_Lodestar#Talents
- https://arknights.wiki.gg/wiki/Thorns_the_Lodestar/Overview

The wiki's indexed descriptions were available during review; direct web-tool access returned 403. Existing operator values and official descriptions are unchanged.

## Validation

- TypeScript, all 15 existing operator tests, and lint for changed components passed. `git diff --check` passed.
- Desktop: Thorns at 1280 × 720, Amiya at 1440 × 900. Both Thorns talent descriptions and the collapsed mechanics link fit at 1280 × 720.
- All six Thorns E0/E1/E2 and P1/P5 combinations retained identical entry positions and heights at 1280 × 720. Locked talents and the selected descriptions update correctly.
- Mobile: Thorns at 390 × 844 and 320 × 740 in light mode, and 390 × 844 in dark mode. Checked Penance's additional potential threshold and fifth navigation item at 390 × 844. Narrow-screen navigation labels were adjusted after visual review.
- Fresh mobile navigation into `#talents`, Skills navigation, browser Back, open/blocked lane controls, keyboard activation and visible focus passed. No horizontal document overflow at 320 px.
- Amiya's level value remained 45 after switching from Stats to Talents and back.
- Thorns outfit switching, full-size Boundless Sail artwork, Escape dismissal and focus restoration passed.
- Artwork-overlay removal and guide creator placement verified at 1280 × 720 in dark mode and 390 × 844 in light mode. All five creators align below their titles, with no horizontal document overflow. Enter opens the artwork dialog; Escape closes it and restores artwork focus. Typecheck and operator-page lint passed after these follow-ups.
- Measured light-mode highlights: `#235BB5` on `#E7ECF0`, contrast 5.457:1.
- The original showcase worktree remained clean. This is a Next development preview; no production build or publication was performed. Browser logs showed an inherited `styles/pulls.css` autoprefixer warning.

Evidence: `../qa-artifacts/operator-dossier-preview-2026-09-14/` in the parent Arkpedia workspace contains desktop-dark and mobile-light screenshots.

## Upstream integration validation

The integrated branch passed typecheck, all 15 operator tests, lint (13 existing warnings), the strict rendered-style audit, and a production build of 638 pages. The production build was checked at 1280 × 720 in dark mode and 390 × 844 in light mode: talent potential icons, section isolation, Mastery-to-Skill navigation, artwork keyboard opening/Escape/focus restoration, light-mode highlight color, guide creator placement and thumbnail loading passed. No horizontal document overflow was observed. The faction watermark uses a local CSS mask to preserve the upstream component conventions.
