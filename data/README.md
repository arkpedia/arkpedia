# Data catalogue

Game records are kept separate from UI code. Existing dataset names remain stable because importers, dynamic file lookups, and refresh pipelines depend on them.

| Area | Files/folders |
| --- | --- |
| Operators | `operators-*star/`, `operator-forms.json`, `operator-voice-lines.json`, `skill-ranges.json`, `skill-timings.json` |
| Stages | `stages/`, `stage-geometry/`, `stage-conditional/`, `stages.json`, `stages-content.json`, stage indexes and legends |
| Enemies | `enemies/`, `enemy_appearances.json`, `enemy-stage-appearances.json` |
| Events and banners | `events/`, `events-data/`, `events.json`, `headhunting_banners.json`, content windows and rotations |
| Skins and music | `skins.json`, `albums.json` |
| Base and game modes | `gamemodes/`, `base-formulas.json`, `is-nodes.json`, `ra-*.json`, `stronghold_enemies.json` |
| Planner and materials | `operatorLevelExpLmd.json`, `battle-records.json`, `item-sort-ids.json`, `item-icons.json`, `import-aliases.json` |
| Games and curation | `stage-guesser.json`, `music-guesser-review.json`, `color-palette*.json`, `techniques_definitions.json` |
| Asset manifests | `assets/`: external file inventory, public availability index, and banner source fingerprints |
| Survey | `survey/poll_raw_export_clean.csv` (private source export); `final-poll-results.json` (published aggregate) |

`public/enemy-detail/`, `public/stage-detail/`, `public/stage-guesser/`, `public/planner-data/`, and `public/lyrics/` are generated delivery data, not additional sources to edit. They stay out of Git.

Do not blanket-publish this folder: it contains the private raw survey export as well as curated content. A future public game-data repository should explicitly select its datasets and retain source provenance.

See [data sources](../docs/development/data-sources.md) and [pipelines](../docs/development/data-pipelines.md) for refresh instructions.
