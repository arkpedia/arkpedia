# Color Palette

Route: `/games/color-palette`. Recruitment Guesser is packaged separately; see [its documentation](recruitment-guesser.md).

## Color Palette

Choose Base Skin or Elite 2 Skin, then identify the operator from five color swatches. Five wrong guesses end a round; Reveal answer ends it immediately and displays the exact source artwork. Only released Global operators with usable artwork enter the chosen mode. Elite 2 requires a real E2 asset and a rarity of at least four; there is no Base-art fallback. Purchasable outfits and other costume labels never enter either mode.

Two optional hints reveal **rarity first**, then **main class** (Sniper, Vanguard, etc., never a subclass such as Marksman or Charger). Hints do not consume guesses. Used hints remain visible on the result, which records how many were used; new rounds and mode changes reset both hints. Rarity and class come from the same operator records as the rest of the site.

The palette uses this order:

1. **Hair:** a representative hair color; use visible headgear, fur, or shell when hair is covered or absent.
2. **Clothing 1:** the main clothing color.
3. **Clothing 2:** a second recognizable clothing color.
4. **Skin / clothing 3:** skin when it is a substantial visible part of the artwork, otherwise another clothing color. A small face or a pair of hands alone does not require a skin swatch. Choose a representative tone from the visible artwork, avoiding isolated highlights or deep shadows.
5. **Accent / item:** a distinctive weapon, accessory, trim, or effect. A small but recognizable detail is useful here, such as Texas's sword.

Use body/equipment colors for nonhuman operators. Base and E2 are reviewed separately. A mostly monochrome design should remain monochrome. This is visual guidance, not an automatic skin classifier or a reason to invent five unrelated colors. Saved review history is retained; refinements follow the same source-pixel review workflow. The legacy `outfit-detail` recipe key denotes the flexible fourth slot.

The initial references in `data/color-palette-features.json` cover 816 available Base/E2 illustrations (425 names/art variants, including future artwork). These are **provisional color targets**, not verified source-feature samples. Their nearest-color generation can still choose an unrepresentative shade. None of those entries automatically counts as manually approved. The Global release filter continues to select the playable pool: 409 Base and 375 E2 choices at introduction. Chestnut's empty E2 asset is excluded.

A [visual review on 2026-09-08](palette-visual-review-2026-09-08.md) checked all 816 illustrations, corrected 184 palettes with 216 source-pixel samples, and retained 606 palettes after comparison. All 26 existing user acceptances/approvals were preserved, including Harold Base. Every current palette now has an applied review. Codex's visual decisions use `accepted`; corrected slots also retain their source coordinates and feature descriptions. Retained colors do not claim newly sampled feature provenance. The provisional targets remain a fallback for future artwork.

A subsequent [review against the updated five-slot guide](palette-guide-review-2026-09-08.md) visually reassessed all 816 artworks, corrected 495 palettes (577 swatches), and recorded the visible feature for every slot. Slot four now reflects substantial exposed skin or actual clothing as appropriate. Changed palettes archive the prior decision; Harold's full approval remains intact. The earlier pass's numbers above describe that historical review, not the current guide pass.

A [targeted clue-quality review on 2026-09-10](palette-fairness-review-2026-09-10.md) screened all 816 palettes and visually checked 43 candidates and reference artworks. It corrected 16 palettes (19 swatches), emphasizing representative feature tones, distinct clothing features, and recognizable E2 accents. All 26 palettes with user review history were left unchanged. This was a targeted refinement, not a new complete visual review.

### Manual review

Run `npm run palettes:review` (Python 3 + Pillow), then open `http://127.0.0.1:3123`. This is a local editing utility, not a public website route. Use `-- --port 3124` to choose another port.

1. **Quick review:** see only the artwork and its suggested palette. Accept with the right arrow or decline with the left arrow. Each choice saves immediately and opens the next unreviewed artwork; the next two artworks preload. Held keys cannot rush through multiple choices. Undo reverses the last choice during the current session.
2. **Adjust declined:** work through declined palettes, saved drafts, flagged uncertainties, and changed artwork. The full editor lets you select a feature slot, click a representative source pixel, and describe it. Save drafts or approve after checking all five samples. Approval opens the next palette in this queue.
3. **All palettes:** revisit previous work or filter by operator, artwork mode, and status. Existing saved reviews are preserved and excluded from the first pass.
4. **Apply reviewed palettes:** regenerate local game data using accepted suggestions and adjusted approvals. Rebuild and use the usual branch/dev sync workflow to publish it. Decisions themselves do not push or deploy anything.

Reviews persist in `data/color-palette-reviews.json`. A quick acceptance stores the exact displayed palette and source hash as `accepted`; it does not claim that its colors were sampled from specific features. A manual `approved` review stores source pixel coordinates and descriptions. Declined entries remain in the adjustment queue. Both accepted and manually approved colors survive regeneration. Concurrent saves or decisions are rejected instead of overwriting another window's work. If the artwork or displayed suggestion changes before a decision, the screen must reload it. Changed artwork is marked stale and must be reviewed again.

`npm run palettes:refresh` preserves accepted suggestions and exact manually approved colors and records a review fingerprint in `data/color-palettes.json`. Declined, draft, flagged, and unreviewed entries continue using the provisional references, whose source/recipe fingerprints invalidate their cache when changed. Normal site builds consume committed JSON and require no Python or image processing. In the game, artwork loads only when the answer is revealed.

`python3 scripts/palettes/test-color-palettes.py` checks generation, exact-pixel validation, review persistence, stale-source rejection, and approved-color preservation. `npm run test:color-palette` checks palette provenance and the minigame behavior.

Inspired by [LCS's color challenge](https://www.youtube.com/shorts/-HiEiIlu2hE) and [Kruel's palette challenge](https://www.youtube.com/shorts/FXZDVwYidME).

## Shared behavior and checks

The game accepts operator names with case/diacritic/punctuation normalization and known language aliases. Autocomplete searches the entire eligible operator roster, not just the answer set. Exact names distinguish alternate operators; ambiguous aliases require an explicit choice. Recently played questions/artworks are avoided, with a safe fallback for small pools. Settings apply between rounds.

`npm run test:color-palette` checks palette artwork, provenance, fingerprints, hints and data budgets. Recruitment behavior and shared answer handling are covered by `npm run test:recruitment-guesser`. The shared Check workflow handles TypeScript, lint, rendered-class coverage, and production builds.
