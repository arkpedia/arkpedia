# The stage dataset, built from public gamedata

`build.mjs` writes every stage file the site serves. It replaces a private
pipeline this repo used to depend on, and it is verified against that pipeline's
output rather than by inspection: `verify.mjs` compares field by field against the
committed `data/stages/`.

```bash
node scripts/stage-pipeline/verify.mjs           # every field, all 3,315 table-backed stages
node scripts/stage-pipeline/verify.mjs zone act  # narrow it to named fields
```

As of the port, every field matches. The geometry (2,804 maps, 1,233 conditional
files, the 77-key tile legend) reproduces with zero semantic differences.

The one field that used not to match was `drops[].measured`, the Penguin Statistics
per-run rate, which drifted on 16 stages because Penguin had recorded more runs since
the oracle was built. That field is gone: it was the only non-gamedata input and the
only one that changed without the game changing, so it made the daily refresh open a
pull request most days for numbers nobody read.

## What each module owns

| module | what it answers |
| --- | --- |
| `gamedata.mjs` | where the EN tables and level files are; the strict `levelKey` join |
| `text.mjs` | the record markup stripper, and `list()` for fields that are sometimes `{}` |
| `names.mjs` | `slug`, `stageSlug`, variant kinds, and the `SlugSet` that breaks code collisions |
| `records.mjs` | identity: code, name, variant, zone, order, costs |
| `story.mjs` | the Act above the Episode, and which event a zone belongs to |
| `contents.mjs` | the 165 content entries and which one each stage is filed under |
| `dates.mjs` | Global release date per content entry, one rule per kind |
| `drops.mjs` | declared rewards, whether they repeat, and the game's rarity wording |
| `level.mjs` | the fight: battle parameters, enemy tallies, the fragment clock |
| `geometry.mjs` | the map: grid, routes, waves, enemy configurations |
| `encode.mjs` | re-encoding geometry to the shape the pages read, losslessly |
| `keyorder.mjs` | published key order, so two runs produce the same bytes |
| `preview.mjs` | which committed render belongs to which stage |
| `synthetic.mjs` | the 815 stages that exist only as a level file |

## Four traps, all of them load-bearing

**The markup stripper has to stay narrow.** 24 stage names really are
angle-bracketed — `<Collected Anecdotes>` — so a blanket `<[^>]*>` empties them.
There are four different strippers upstream and they are not interchangeable; each
module carries the one that belongs to its output.

**Gamedata's list-shaped fields are sometimes an empty dict.** 426 stage rows carry
`unlockCondition: {}`. That is falsy in the Python this replaces and truthy in JS,
so every such field goes through `list()`.

**Python sorts strings by code point.** `'Zealot'` precedes `'archer'`.
`localeCompare` would silently reorder every mixed-case tie in every enemy list.

**Row 0 is the bottom row.** Upstream stores the tile grid top row first and route
positions bottom row first. Getting the flip wrong mirrors every map vertically and
still looks like a map.

## What is deliberately not reproduced

Two content entries upstream carries — `event/act17d1` and `event/act42d0` — are
minted by its ENEMY collectors from mode tables that name enemies without any
stage or level file. No stage references either, so a stages pipeline has nothing
to file under them.

Python writes `0.0` where `JSON.stringify` writes `0`. Float-ness is a property of
the source literal and is lost at `JSON.parse`, so the committed files differ from
a fresh build in that spelling alone. The first refresh normalises them.

New renders for a new event still need the upstream image repos: this pipeline
decides which stage points at which render, and resolves it against
`public/stages-images/` in this repo, but it does not fetch new artwork.
