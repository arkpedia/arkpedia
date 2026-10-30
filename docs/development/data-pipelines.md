# Data pipelines and audits

## Chibi artwork

`importer/scripts/sync/sync-chibi-art.mjs` reads `arkpedia/arkpedia-sd-assets`' main commit, then its manifest at that exact commit. `websiteSkins` maps the existing skin IDs to complete front/back/base models; `build-chibi-index.mjs` emits only SD repository URLs for their skeletons, atlases and every texture page. Base animation models stay separate from battle facings, and shared originals stay explicit aliases.

The `chibi-art` stage runs in arkpedia-data's import. The fingerprint watches the SD repository; the catalogue is a record in arkpedia-data like any other. Missing or incomplete manifests fail the stage and retain the previous catalogue; an update cannot remove an existing skin/facing. There is no browser fallback to an upstream asset repository.

SD's `websiteDefaultSkins` declares the native default ID for template forms that start at `#2`. The index retains that exact skin and adds a same-operator `#1` display lookup for the page's Base label. The source declaration is required; no missing Base model is guessed from an available promotion or other operator. This lets future template forms use their published native defaults without website-specific exceptions.

To adopt an already published SD manifest locally, run `node scripts/sync/sync-chibi-art.mjs`
from arkpedia-data's `importer/`.

SD's `sync-chibis.yml` discovers new operators, outfits and base models daily at 16:23 UTC. It reads the native skin table and model tree from one upstream commit, imports complete files, validates the full manifest, and publishes them together. The website's scheduled content release waits for this SD job before its revision probe and reports failed or stale syncs through the shared asset report. Missing original battle files remain pending and retry on later runs; existing skin/facing coverage is retained.

This stage adopts published SD coverage; it does not substitute upstream artwork. The operator page props carry the pinned URLs through `arkpedia-data`, so later SD catalogue updates need a content release rather than an application redeploy. The 19:57 UTC content schedule and GitHub's scheduling delays determine adoption after the upstream model dump is available; a failed or late sync leaves the previous artwork usable.

## Guide videos

The guide-videos stage, its records and the **Guide suggestions** issue moved to arkpedia-data with
the import: see its `docs/importer.md`, "Guide videos".

## Event PVs

An event page's PVs tab (`components/events/EventVideos.tsx`) shows the event's official videos from `data/event-videos.json`. The `official-videos` stage of arkpedia-data's import (`importer/scripts/sync/sync-official-videos.mjs`, rules in `event-videos.mjs`) writes it. Three files in arkpedia-data `source/data/` feed it:

- `official-video-channels.json`, kept by hand: the official YouTube channels, in the order they are preferred. Global's (Arknights Official - Yostar) is read; Japan's and Korea's are listed with `"use": false` until their titles have a rule (they would match on the regional `localName` in `regional-schedules.json`). Only an official channel goes in: never a fan's re-upload.
- `official-videos.json`, written by the stage: every upload of the channels in use, with its day. The import adds the newest 15 from each channel's Atom feed; a channel it cannot read is held in the quarantine until a run reads it.
- `event-video-overrides.json`, kept by hand on the `editorial` branch: `{ "events": { "<event name>": { "add": [videoId], "remove": [videoId] } } }`. `add` takes only an upload already in `official-videos.json`, so nothing but an official upload can reach a page. Any other id, or an event name no page has, is left out and listed in the `Content quarantined` issue; the release goes out without it.

An upload goes to an event when its title names the event as whole words, within 30 days before to 14 after the event's Global window (the longest name wins, so "#1", "Rerun" and "Alliance" pick their own event), or when it is a preview or an EP of an operator the event's banner features. Everything else (lore videos, livestreams, most EPs) goes nowhere until an override adds it. A rerun and its first run share their videos, each marked Launch or Rerun on the page: a rerun's page lists the launch's trailer, PVs and EPs after its own PV, even before its Global date is confirmed. The link is `inheritsFrom` in `event-rewards.json`, else the first run named as the rerun without " Rerun". Every compile here files the catalogue into events again with `npx tsx scripts/sync/sync-official-videos.mjs --offline`, which reads nothing from YouTube, so an editorial override is live with that run.

A new channel's history is read once, by a person, from arkpedia-data's `importer/`: `npx tsx scripts/sync/sync-official-videos.mjs --backfill --channel <id>` (it needs `yt-dlp` on `PATH`). It lists the channel's Videos tab and asks YouTube's player for each upload's day, about a second each. Push the resulting `official-videos.json` to the editorial branch. Don't run the backfill on the runner: YouTube refuses the player from it more often than not.

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

The stage records, and every other refresh step that reads no application code, are built
by arkpedia-data's nightly import (its `importer/`, `import.yml`) and arrive on its
`imports` branch. How to run and operate it is in that repository's `docs/importer.md`;
`importer/scripts/content/run-imports.sh` and `importer/scripts/sync/refresh-stage-data.sh`
list its steps. What follows is what this repository still does.

### Regional web campaigns

The import's `community-web-events` stage
(`importer/scripts/sync/sync-community-web-events.mjs`) reads the public EN/JP/KR website
home and news feeds and the Korean official Naver cafe's web-event announcements.
Publication requires each regional campaign's own canonical URL and a complete,
unambiguous period in its rules; unsupported rules go to `data/quarantine.json` for
review, and source outages retain verified records.

Verified records and official CDN artwork URLs go to
`data/community-web-events.json`; the normal content release updates Community →
World without a code deployment. That record is the only source: a manually verified
card is an editorial edit to it, and the sync keeps what a previous run verified.
Closed events remain in the data but disappear from the current-events view automatically.

Discovery covers recent official website/cafe announcements linking campaign microsites.
Social-only announcements and other URL/rule formats may still need a manual entry or a
new source/parser.

### Refreshing locally

Serving the site needs nothing but `npm install`: every byte it reads is committed or
pulled from the live release.

`npm run stages:refresh` runs the refresh steps that stay here: the EN game tables, which
the pull sources and first clears read, and the story chapters and covers, whose source
(arknights.timo.beer) refuses GitHub's runners, so the import cannot read it. Run on its
own it first pins one commit per upstream mirror and settles where the CN tables come
from. Upstream is pulled into `.cache/upstream/` as partial, shallow, sparse checkouts,
downloading only the paths those steps read; `ARKPEDIA_EN` points a step at a local
checkout instead.

Every other step runs in the import: to run one locally, clone arkpedia-data and work in
its `importer/`, whose `data/` and `public/` are links to `source/`.

`check-completeness.mjs` runs here and fails a release in which a listed stage fields an
enemy with no record or no `enemies-index.json` row.

### Doing it on a schedule

The import runs nightly at 16:17 UTC and leaves its records on the `imports` branch.
`.github/workflows/prepare-content.yml` compiles that branch merged with data main at
19:57 UTC (the schedule and the gates are in [runtime content](runtime-content.md)).
Unchanged upstream revisions and an unchanged `imports` head skip expensive work. The
compile runs only the steps that stay here, then publishes a release to `arkpedia-data`.
It is the only workflow here that runs `stages:refresh` or `assets:update`
(`scripts/tests/test-workflow-files.ts` holds that).

After a game patch the import does not wait for the night: arkpedia-data's client-version
dispatcher starts it with `reason: patch`, and the content watcher
(`scripts/content/editorial-watch.mjs`) has that import compiled as soon as it sees it.

The app keeps no records of its own. `data/` and the `public/*.json` records are not
committed here: Check, the browser specs, every build and local dev fill them from the live
release in `arkpedia-data` (the commit `live/current.json` names), and a new record goes into
`arkpedia-data` first:

```bash
npm run data:pull                 # the live release
npm run data:pull -- --ref main   # data main, or any branch or commit
```

A workflow that used to rebuild `data/` from upstream and open a pull request into this
repository (`refresh-stage-data.yml`) was retired on 2026-09-26: its bundle could diverge
from `arkpedia-data` (a hand correction made there was overwritten in the app copy), and
merging it re-pinned the deploy's assets and deployed production.

New supported records can reach the site without a website deployment through
[runtime content releases](runtime-content.md). New mechanics, schemas and UI
still require application changes.

### Art the importers fetch

No importer publishes art or writes it under `public/` (`check:assets` refuses any image
there). Each stages what `arkpedia-image-assets` does not publish yet under
`.cache/<kind>/`, as the source serves it, and lists it in `.cache/<kind>/staged.json`
with its destination and where it came from (`scripts/lib/staged-art.mjs`);
`config/staged-art.json` names the kinds. The import stages and publishes all of them but
one: the story covers, which the compile here stages and publishes in its `story-art` stage.

`publish-catalogue-assets.sh --staged` publishes what a kind's stage staged in that run, if
the stage ran to the end, with the catalogue's deploy key and publisher: one size and
encoding per destination folder (material and item icons keep the game's 183px circled art),
a source-map row for a mirror's file, a provenance row in `sources/catalogue-imports.json`
for every file, and a fast-forward push retried from a fresh clone when another job pushed
first. It then adopts the new asset revisions (asked again while GitHub still reports the
head from before the push), re-pins the records that name art by revision as the
`media-pins` stage did, and runs each importer that staged something again, so the records
point at the files and their quarantine entries clear in the same run, and the next day's run
finds nothing to publish. If anything after the push fails, the stage is rolled back with the
asset pins, and the next run adopts what was pushed. A staged file the publisher leaves out
(gone, changed since it was staged, or not an image) is only logged: the importer that staged
it holds it under its own stage (`story-cover:<id>`, `item-icon:<id>`, ...) until a run
publishes it, so it is one entry in the daily issue, not two. A running event's stage with a
map and still no preview is held by the completeness stage (`stage-preview:<slug>`) whatever
the reason. Run on its own, `refresh-stage-data.sh` stages and reports, and publishes nothing.

`python3 scripts/sync/test-publish-catalogue-assets.py` and `scripts/tests/test-staged-art.ts`
check this offline; the last runs the whole stage against a scratch image repository,
including a push that loses a race.

### What is not automatic

- Renders the CN mirror does not carry yet. A new event's stage renders arrive with
  yuanyan3060/ArknightsGameResource's `map/`; until then its stages show the event's
  poster, and the completeness stage lists them while the event runs.
- `TILES_PER_SECOND` in `lib/stages/stagePlayback.ts` is the one figure not read
  from the game's files; see the comment there.
- A brand-new *kind* of content. `data/game-modes.json` (kept by hand in arkpedia-data,
  checked by `lib/stages/gameModes.mjs`) says what each `activity_table` type is: a
  limited-time mode whose stages the list never offers (`excludedActivityTypes`), a
  challenge mode the game files as an event but shows under Seasonal Challenge
  (`seasonalChallenges`, with the display code its contents carry), or a story episode
  (`storyActivityTypes`, a pattern). An event of a type it does not classify is still
  listed as an ordinary event, but the import's `importer/scripts/build/build-mode-exclusions.mjs` holds it in
  `data/quarantine.json` (key `activity-type:<content>`, naming the type), so the daily
  "Content quarantined" issue lists it until the record says what it is. A challenge
  season whose code is not the record's is held the same way (`challenge-label:`). Either
  fix is a data edit in arkpedia-data, not an app deploy. A new storyline still lands in
  "Events outside a storyline" until the storylines table names it.
- A second Reclamation Algorithm season. `data/ra-nodes.json` is one season's survey
  (`contentId`, sandbox_1); another season's page draws no map until it has its own.
