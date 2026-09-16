# Data pipelines and audits

## audit-base-skills.mjs

Checks the base-skill model against the game's own `building_data.json`.

```bash
npm run audit:base              # check -- exits 1 on any new finding
npm run audit:base -- --update  # accept the current state as the baseline
```

Needs the EN gamedata. Defaults to the upstream cache the stage pipeline keeps,
`.cache/upstream/en-gamedata/en/gamedata/excel`, so `npm run stages:refresh` is what
fills it; override with `ARKPEDIA_GAMEDATA`. With no gamedata present it prints
`SKIPPED` and exits 0, so it never blocks work on a machine that doesn't have it.

### What it checks, and why the type system can't

Every base skill reaches the calculation either through a
`lib/base/*SpecialSkills.ts` map keyed `"Operator|SkillName"`, or through a
generic regex over its English description. **Both fail silently.** A handler
key carrying a quote the scraped name lacks is simply never called, and a skill
that matches no handler and no regex is worth zero. Neither shows up in `tsc`,
in a build, or in the UI -- Viviana's key was wrong for as long as the handler
existed, and the only symptom was a plausible-looking number.

| check | catches |
|---|---|
| `activation` | an Elite 2 skill that should replace its Elite 0 version but stacks with it, or a skill live at the wrong tier |
| `deadKeys` | handler keys matching no real operator/skill -- dead code |
| `coverage` | skills no handler and no regex touches |
| `unmatched` | operators absent from the gamedata dump, so unverifiable |

### The baseline

`base-skill-audit-baseline.json` holds the known, accepted findings, so a clean
run means "nothing new" rather than "nothing at all". It currently holds only
deliberate omissions: Training Room (129 skills) and Workshop (118), neither
modelled on purpose, plus `Ukusik`, who postdates the EN dump.

Only baseline something after deciding it is genuinely not worth modelling.
Anything else appearing here is either a bug or an operator to wire up.

### After a gamedata refresh

1. Regenerate the slot table (see the header of `lib/base/baseSkillSlots.ts`).
2. Run `npm run audit:base`.
3. Work through anything it reports as NEW.

Step 2 is the point of all this: new operators arrive with skills whose
conditions only exist as English prose, so a human still has to read them and
write the handler. What this removes is having to *notice* that they need one.

## Stage data pipeline

### Before the first refresh

Serving the site needs nothing but `npm install`: every byte it reads is committed.
Refreshing needs two things the repo cannot install for you:

```bash
python3 --version          # 3.10 or newer
pip install pillow certifi # renders are converted to webp; urllib needs a trust store
```

Nothing else. Every upstream source is public and no step needs credentials: this
repo is what gets deployed, so it has to be able to rebuild its own data even if
every other repo in the project goes away.

`npm run stages:refresh` rebuilds everything under `data/` and `public/` that
describes stages, in dependency order. A fresh clone of this repo is all it needs:
the first step pulls the upstream data into `.cache/upstream/` as partial, shallow,
sparse checkouts, downloading only the paths the later steps read.

| cache | upstream | paths | why |
| --- | --- | --- | --- |
| `cn-resource` | `yuanyan3060/ArknightsGameResource` | `gamedata/excel`, `gamedata/levels`, `map`, `item` | CN gamedata, level files, CCB renders, item icons |
| `en-gamedata` | `ArknightsAssets/ArknightsGamedata` | `en/gamedata/excel`, `en/gamedata/levels` | the whole stage dataset: tables, maps, waves, enemy configurations |

Every input is gamedata. Measured drop rates from `penguin-stats.io` used to be read
here too and were removed: they were the only non-gamedata input and the only one that
changed without the game changing, so a scheduled refresh produced a diff most days
from sample counts that were never displayed.

IS renders come over HTTPS per file from `fexli/ArknightsResource`, at a commit
pinned in `import_is_nodes.py` — bump `REPO_COMMIT` for a new season's renders.

Then `npm run build`. Set `ARKPEDIA_CN` or `ARKPEDIA_EN` to point a step at a local
checkout instead of the cache.

### What each script owns

| script | writes | reads |
| --- | --- | --- |
| `stage-pipeline/build.mjs` | `data/stages/`, `data/stages-content.json`, `data/stage-geometry/`, `data/stage-conditional/`, `data/stage-tile-legend.json`, `public/stages-index.json` | EN gamedata |
| `build-mode-exclusions.mjs` | `data/excluded-contents.json` | `activity_table` types, content kinds |
| `import_is_nodes.py` | `data/is-nodes.json`, IS renders | `roguelike_topic_table`, fexli renders |
| `import_cc_stages.py` | `data/cc-stages.json`, CCB renders, CCB labels in `stages-content.json` | `medal_table`, `map/` renders |
| `import_stage_devices.py` | `data/stage-devices.json` | level files' `predefines`, `character_table` |
| `build-story-groups.mjs` | `data/story-groups.json` | `stage_table.storylines` |
| `build-content-windows.mjs` | `data/content-windows.json` | `activity_table`, `crisis_v2_table` |
| `import-item-icons.mjs` | `public/item-icons/`, `data/item-icons.json` | upstream `images/manifest.json` |
| `enrich-stage-index.mjs` | `public/stages-index.json` (in place) | everything above |

`enrich-stage-index.mjs` **runs last**: it applies the exclusions and folds in the
variant links, the names the source leaves blank, CCB codes and names, and the
content labels. Running it before the others leaves the index missing all of that.

### Doing it on a schedule

Routine updates use `.github/workflows/prepare-content.yml` at 16:57 UTC,
after the public asset syncs. Unchanged upstream revisions skip expensive work.
The refresh includes English voice transcripts and missing English profile/archive
text, then proposes a reviewed release in `arkpedia-data`. The older
`refresh-stage-data.yml` workflow is a manual bundled-fallback tool only.

New supported records can reach the site without a website deployment through
[runtime content releases](runtime-content.md). New mechanics, schemas and UI
still require application changes.

### What is not automatic

- New RENDERS. `scripts/stage-pipeline/` decides which stage points at which
  in-game map picture and resolves it against `public/stages-images/`, but it does
  not fetch new artwork: a new event's renders still have to be added there.
- `TILES_PER_SECOND` in `lib/stages/stagePlayback.ts` is the one figure not read
  from the game's files; see the comment there.
- A brand-new *kind* of content (a new game mode, a new storyline) may need its own
  line in `build-mode-exclusions.mjs` or will simply land in "Events outside a
  storyline" until the storylines table names it.
