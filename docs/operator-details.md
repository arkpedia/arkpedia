# Operator stats and files

Each existing `data/operators-*star/*.json` record now has `stats` and `files` fields. The importer adds only those fields, preserving the rest of each record. The roster and other list pages keep their existing projections, so archives and stats are sent only with an individual operator's detail page.

## Import and audit

Run from the repository root:

```sh
npx tsx scripts/import-operator-details.ts /path/to/operator_stats.csv /path/to/operator_files.csv .cache/operator-import
```

This validates everything without writing. Add `--write` to apply the validated import. The source directory must contain `character_table.json`, `char_patch_table.json`, `favor_table.json`, and `source.json` describing the repository, commit and path. See `data/operator-import-report.json` for the source commit and SHA-256 fingerprints used for this import. The CSVs are user-supplied inputs and are not required for a normal build.

Game data comes from [Kengxxiao/ArknightsGameData at the recorded commit](https://github.com/Kengxxiao/ArknightsGameData/tree/cc5bf84b0e6d552d9c13619e2683ff25c5bbeecb/zh_CN/gamedata/excel). Obtain all three game tables from that commit when reproducing this import. `source.json` is:

```json
{
  "repository": "Kengxxiao/ArknightsGameData",
  "commit": "cc5bf84b0e6d552d9c13619e2683ff25c5bbeecb",
  "path": "zh_CN/gamedata/excel"
}
```

Stats match `character_id` to `internalName`, never an operator's display name. Each promotion keeps level endpoints and per-stage values for HP, ATK, DEF, RES, redeployment time, DP cost, block count and attack interval. Rounded linear interpolation reproduces all 82,090 relevant CSV rows exactly. The schema supports per-level overrides if a later import contains an exception. It also preserves range IDs without substituting a generic branch range.

The importer rejects missing operators, duplicate levels, gaps, ambiguous file names, mixed modes, unknown Amiya file labels, and game-data endpoint disagreements before writing. Raidian and Mechanist use their playable `SO` character IDs; temporary `SP` variants and reserve operators are excluded. The report lists every excluded ID.

Archives retain their exact section names, unlock text, paragraph breaks and Unicode. Archive names are resolved through the stat CSV's character IDs, including localized spellings. Amiya's Caster, Guard and Medic records receive only files whose supplied form labels apply to them. Ten archive rows for five temporary recruitment operators absent from the roster are excluded and reported. Shared Amiya files appear on each applicable form, resulting in 2,416 imported entries.

## Trust and display

The Stats view under Combat shows base stats and the owned operator's trust contribution. It excludes skills, talents, potential and module changes; it is not a combat-damage calculator.

The [game's favor table](https://github.com/Kengxxiao/ArknightsGameData/blob/cc5bf84b0e6d552d9c13619e2683ff25c5bbeecb/zh_CN/gamedata/excel/favor_table.json) maps displayed trust percentages to `battlePhase = floor(percent / 2)`. A character's `favorKeyFrames` reaches its maximum at battle phase 50, corresponding to 100% displayed trust. The importer verifies that mapping against all 201 percentages. Bonuses use those phases, with nearest-integer display rounding. Values from 100% to 200% have the same stat bonus.

The historical borrowed-unit penalty is not implemented. [PRTS records its removal on CN](https://prts.wiki/w/%E4%BF%A1%E8%B5%96); the Global-specific detail would need verification before adding a separate support-unit mode.

Native details/summary controls keep archive text collapsed until requested and expose the unlock conditions without simulating ownership. The statistics controls reset when navigating to another operator, and persist when switching areas on the same operator.

## Validation

```sh
npm run test:operators
OPERATOR_STATS_CSV=/path/to/operator_stats.csv npm run test:operators
npm run typecheck
npm run lint -- --max-warnings 15
npm run build
```

The optional CSV test compares all eight values at every imported level. CI runs the standalone tests without private file paths. The Amiya form builder preserves independently imported stats and files on subsequent refreshes.

## Operator page navigation

On desktop, large artwork stays on the left and the operator identity and navigation stay above the right-hand detail panel. Only the active detail view scrolls. At 900px and below, artwork appears above the details, the page uses normal document scrolling, and the identity and navigation remain sticky while reading.

Overview, Combat, Upgrades and Profile are keyboard-accessible tabs (arrow keys, Home and End). A second row selects one view at a time: skills, stats, talents, synergy, base skills, mastery, modules, promotion, potential, character information, files or guides, where available. Synergy sits under Overview alongside At a glance and Guides, where available; existing `#synergy` links select Overview automatically. Opening a view replaces the content in place. Each primary tab remembers its last view, and each view remembers its reading position for the current operator.

Existing fragments such as `/operators/Amiya#stats`, `#mastery`, `#modules` and `#files` select the corresponding view without scrolling to a document anchor. `#gameplay` remains supported as the Combat tab; the former `#appearance` link opens Profile with artwork already visible. Next's shallow navigation keeps Back and Forward working without resetting component state.

Skill and level selections are shared between Combat and Upgrades. Module selection, stage and cost scope persist across tabs. Stats controls and native file disclosures stay mounted so adjusted values and opened archives survive view changes. These settings reset when navigating to a different operator or Amiya form. Artwork rotation starts paused and artwork can be enlarged from any tab.

Skill and module costs default to the selected step; cumulative-cost controls are independent. Promotion costs use a flat material list, verified against every operator record in `test:operators`. Initial SP, SP cost and selected-level duration retain explicit labels. Stats remain base values plus trust, independent of skill effects.

### Interaction checks

Check desktop and phone widths with Thorns the Lodestar and Amiya:

- Open a deep link, switch primary tabs and detail views, then use browser Back.
- Select S2 and a non-default level, leave Combat, and return to the same selection and scroll position.
- Change level and trust under Stats; switch views and confirm both values remain.
- Open an archive file; leave Profile and confirm it remains open when returning.
- Select a module stage, change tabs and confirm the stage persists.
- Navigate between Amiya forms and confirm operator-specific controls reset.
- Check artwork selection and enlargement, keyboard tab navigation, light/dark themes, and horizontal fit at 320px and 390px.

The layout borrows prominent character presentation from [Valorant](https://playvalorant.com/en-us/agents/jett/), in-place ability selection from [Warframe](https://www.warframe.com/en/game/warframes/citrine/), and persistent database navigation from [Project Amber](https://gi.yatta.moe/en/archive/avatar/10000052/raiden-shogun). No code, artwork or data was imported from those references.

### Information hierarchy and image paths

The planner action appears once in the identity header as a secondary button. Upgrade views start directly with their information. The optional mechanics and interaction explanations under skills and talents are collapsed initially; skill descriptions, numbers, ranges, and costs remain visible.

Operator portraits and appearance URLs encode the complete filename, matching skill icons. Keep the original filename for filesystem or public-asset-index lookups and encode only when returning its URL. This preserves accented names and URL delimiters without renaming assets.
