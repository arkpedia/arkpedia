# Stage Guesser

Route: `/games/stage-guesser`, in the existing Games catalogue.

## Pools

- **Classics:** 231 user-selected story and event maps in `data/stage-guesser.json`.
- **All:** every named, released Global normal or standalone H stage with valid local tile geometry and a WebP map image. At the September 10, 2026 build this is 1,806 stages across 121 sources, including story, events, supplies, Annihilation, SSS and Reclamation Algorithm. Undated/future content and missing assets are excluded; this is not a claim that every Arknights stage has assets in the database.
- **Custom:** any union of chapters/events/other sources, with a searchable checklist, Select all/matching, Clear selection, counts, and a disabled Start button for an empty pool. Selections survive round changes within the page.

Rerun records with the same code and rendered layout count once. Different stage codes whose layouts render identically are accepted as equivalent answers, because the opening clue cannot distinguish them. Image hints may contain game units/route annotations, including Classic’s 3-8, 4-4 and 4-10. These are accepted as extra clues after the anonymous opening layout, rather than excluding an iconic battlefield because of the available image. Classic map files have pinned SHA-256 fingerprints and validated local geometry.

## Classics selection

The roster in `data/stage-guesser.json` follows the user's supplied list. It replaces the previous 32-map editorial selection, including removing supply and Annihilation entries that were not requested. The duplicate JT8-3 is counted once; OF6 resolves to OF-6 and CB-EX2 retains its canonical code. WB-EX-86 is interpreted as WB-EX-6, and SN-S-1 through SN-S-4 each include their A and B maps. SV-5, SV-6 and SV-7 refer to Under Tides, not the older Children of Ursus stages with the same codes.

Standalone story H stages that only exist in Adverse Environment are eligible in all three collections and in answer search. Optional Challenge Mode, six-star and parent-map difficulty copies remain excluded. The map's version is shown after the round, so it does not disclose the H-stage category before the player guesses.

## Play and mobile layout

The opening clue is Arkpedia's tile renderer, without routes, units, names or enemies. Its tile inspector and accessible legend reuse stage-browser metadata. Five distinct wrong guesses end a round; the second unlocks the image and the third unlocks the chapter/event. Hints can be revealed early for free. Invalid or repeated guesses cost nothing. Winning/revealing links to the stage browser; Next stage resets state and avoids recent stage slugs.

Answer search covers the full named Global stage catalogue (normal maps and standalone H stages), independently of the selected question pool. Stages without the usable image or layout required for quiz questions can still be submitted as guesses. Collections only determine which maps are drawn as questions. Codes ignore punctuation, spaces and case. Optional event/chapter search supports `undertides`, `chapter 8`, `episode 8`, `ep08` and chapter titles. These list stage answers; an event name itself is not a guess. Every matching stage is available in the scrolling suggestions. Arrow keys and Enter select suggestions; ambiguous titles/codes require a selection. Search mode is under a collapsed Search settings control.

Desktop keeps the map and answer beside each other. Mobile places the answer immediately after the map and moves the legend below the play controls. Focusing the answer opens a compact typing view: map on top, input and scrolling results underneath, guesses remaining and a Done typing control. The view tracks `visualViewport` height/offset, so it fits above a software keyboard. Suggestions never open upward over the map. Finishing a round exits this view, as does Done typing. Existing fonts and theme tokens remain in use.

## Build and payload

`predev` and `prebuild` run `scripts/build/build-stage-guesser.ts`. It validates the catalogue and emits ignored, derived JSON files into `public/stage-guesser/`. The page's static props contain only group/count metadata and a content-addressed catalogue URL. The question metadata and separate answer index are fetched together once on the first round; each round fetches one compact layout. Layouts exclude routes, waves, enemies and playback data. Both catalogue and layouts use content hashes in filenames to avoid stale cached JSON. Fetch failures leave a retryable Start/Next control and do not spend a round.

This is casual practice: no timer, leaderboard, account, persistent round history or attempt to hide answers from browser inspection.

## Validation

`npm run test:minigames` includes the existing palette/recruitment tests and Stage Guesser's source, release-boundary, geometry, search, hints, duplicate, terminal-state and payload checks. Catalogue coverage additionally verifies custom unions, missing/future exclusions, no duplicate code/layout records, the curated Classic entries, and a lazy combined question/answer catalogue under 200 KB gzip; initial group metadata is under 30 KB raw.

The expanded Classics checks cover all 231 selected stages, matching names and geometry, map fingerprints, Global release boundaries, tutorial and later H-stage inclusion, Under Tides code collisions, A/B map selection, deduplication and exclusion of the old unrequested Classics. The combined lazy catalogue remains under 200 KB gzip.
