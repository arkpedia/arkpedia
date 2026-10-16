# Data catalogue

Game records are kept separate from UI code. Existing dataset names remain stable because importers, dynamic file lookups, and refresh pipelines depend on them.

| Area | Files/folders |
| --- | --- |
| Operators | `operators-*star/`, `operator-forms.json`, `operator-voice-lines.json`, `skill-ranges.json`, `skill-timings.json` |
| Stages | `stages/`, `stage-geometry/`, `stage-conditional/`, `stages-content.json`, `supply-stages.json` (derived from `stages/`), stage indexes and legends |
| Enemies | `enemies/`, `enemy_appearances.json`, `enemy-stage-appearances.json` |
| Events and banners | `events/`, `headhunting_banners.json`, content windows and rotations |
| Skins and music | `skins.json`, `albums.json` |
| Base and game modes | `gamemodes/`, `base-formulas.json`, `is-nodes.json`, `ra-*.json`, `stronghold_enemies.json`, `mode-rotations.json`, `sss-cycle.json` (the SSS cycle the home ticker counts down to, kept by hand) |
| Planner and materials | `material-catalogue.json` (derived by `scripts/build/build-material-catalogue.mjs`), `material-names.json` (English names of CN-only materials, kept by hand), `operatorLevelExpLmd.json`, `battle-records.json`, `item-sort-ids.json`, `item-icons.json`, `import-aliases.json` |
| Games and curation | `stage-guesser.json`, `music-guesser-review.json`, `color-palette*.json`, `techniques_definitions.json` |
| Asset manifests | `assets/`: external file inventory, public availability index, and the asset repositories' pinned commits (`revisions.json`) |
| Survey | `final-poll-results.json` (closed survey aggregate; raw responses are archived privately outside this checkout) |

`public/enemy-detail/`, `public/stage-detail/`, `public/stage-guesser/`, `public/planner-data/`, and `public/lyrics/` are generated delivery data, not additional sources to edit. They stay out of Git.

The canonical game records are in `arkpedia-data/source/`; these copies are a development/build fallback. Keep publication explicit and preserve source provenance. Never add raw survey responses to either public content or this application checkout.

See [data sources](../docs/development/data-sources.md) and [pipelines](../docs/development/data-pipelines.md) for refresh instructions.
