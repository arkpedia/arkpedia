# Base account view and rotation

`/base` has two sources. **Your plan** is the editable, browser-local setup.
**Imported account** displays the last imported building snapshot. Switching views
never writes the snapshot over the plan. **Edit a copy** explicitly does that and
keeps an existing completed plan as a recoverable saved preset.

## Snapshot reader

`lib/account/baseSnapshot.ts` reads `account/syncData.user.building` during the
existing account import. No new game requests or staffing writes are made.
The normalized snapshot lives inside the per-server AccountRecord, so account
switching and backups carry it with the account. Imports made before this feature
need to be repeated; building fields were previously discarded.

- `roomSlots[slot].roomId`, `.level`, `.charInstIds` identify rooms and staffing.
  Room detail lives at `rooms[roomId][slot]`; its `.level` is a fallback.
- The slot-to-floor mapping is `building_data.layouts.v0`: slots 24/25/26 are B1,
  14/15/16 B2, and 5/6/7 B3. The overview uses the production floor plan: production
  rooms on the left, Control Center above the central dormitories, two elevator
  shafts, and Reception/Workshop/Office/Training down the right-hand column.
- Instance IDs resolve through `troop.chars`. Combat forms resolve to one physical
  operator. Training's second operator is kept separately as the trainee.
- `building.chars[instance].ap / 360000` is displayed Morale, using the game table's
  `manpowerDisplayFactor`. Missing Morale stays unknown; zero is preserved.
- Operator promotion and level are retained, including unassigned owned operators,
  for skill unlocks and replacement picks on the shown server. Unknown progress
  uses conservative E0/Lv1 defaults where fields are missing and reports a warning.
- Factory formulas 1/2/3 map to Battle Records, 4 to Precious Metals and 13/14 to
  Originium Shards. Unsupported chip recipes are left unmodeled. Output estimates
  use Tactical Battle Records; lower-tier recipes report that limitation.
- Dorm ambience reads `comfort` or `diySolution.comfort`. If absent, calculations
  use zero and explain this. Unknown room types/levels are omitted with warnings.

The assignment/detail protocol is cross-checked against the public
[Arkdays building controller](https://github.com/Shiiyuko/Arkdays/blob/main/src/main/java/com/hypergryph/arknights/game/building.java)
and [ArkPRTS automation client](https://github.com/ashleney/ArkPRTS/blob/master/arkprts/automation.py).
Slot positions, capacities, Morale units and formula categories are from the game
`building_data` table used in the preceding base skill audit. Tests use synthetic
protocol/account fixtures, not a player's private export. A fresh live Yostar
import with building data remains a separate integration check.

Room/staff/level/Morale data describes the import instant. Displayed productivity
and depletion/recovery rates are calculator estimates, using known starting Morale, the collection
interval and conditions; elapsed time since import is not projected. Ling and
Dusk use their individual imported Morale when known. Training mastery/history
and remaining training time are not imported, and no target mastery is presented
as an account fact. Workshop recipes/counters require an editable copy.

## Floor plan

The updated staffing tiles retain their summaries and imported-account details,
with the production facility colors filling each tile. Staffing opens a full-width
panel in place of the map, with a multi-column roster and complete skill descriptions.
Back or Escape restores the map's pan, zoom and keyboard focus. Narrow screens
keep the same floor positions instead of reflowing into a card list. Fit, zoom
buttons/slider, Ctrl/Cmd-wheel, touch pinch, drag/native scrolling, and fullscreen
provide access to every room. Dragging or pinching does not select a room.
Fullscreen keeps keyboard focus within the map; Escape or selecting a room exits it.

## Rotation

The **Presets** control stays highlighted while its section is open. **Clear base**
empties the current workers, products, ambience, training and crafting settings
without changing facility layout/levels, saved presets or rotation. It also
deselects the loaded preset so a new setup can be saved separately.

**Rotation** opens a modal timetable with Escape, close and backdrop dismissal.
**Add to rotation** saves the imported staffing as a setup and adds a 12-hour
shift without replacing the draft. Other working/resting setups can be saved in
Presets, then selected as shifts with a duration and start time. Load shift
explicitly loads its complete setup into Your plan. Rotation survives reload and
is included in backups.

The timetable recalculates each complete saved setup with the current cross-room
calculator. Saved Morale rates remain in backups for compatibility; the page uses
fresh rates, including for older presets. Positive
rates consume Morale; negative dorm rates recover it up to 24. Unassigned operators
do not recover off-base. Workshops are discrete crafts, not continuous drains.
The initial state uses imported Morale where available, then saved Morale or 24.
Two complete cycles are checked. Warnings cover exhaustion, deleted setups,
unowned operators, duplicate placements, and changes to room types/levels.
Unbuilt rooms do not count toward facility-count skills.

Production summaries default to **Current Base**. **Rotation** uses the second
cycle's output, weighting complete saved setups by their hours and normalizing
to a day, including cycles that are not 24 hours long. Morale carries from the
first cycle into the return shifts; it is never refreshed simply because a shift
starts. The collection window is capped by the selected login interval and shift
duration. Missing setups, an empty timetable or incompatible room layouts show
a repair instruction instead of substituting current-base output. Switching the
calculation source never loads a shift into the editable plan.

These are planning estimates using the room calculator's conservative cutoff
when the first worker exhausts. The second cycle is not a claim of long-term
equilibrium. This manual timetable does not optimize
replacement teams, import an in-game preset/rotation history, change staffing in
the game, or simulate chronological threshold changes, skill warm-up or one-off
Morale/training effects. For those numeric-model boundaries, see
[the base skill audit](base-skill-audit-2026-10-09.md).

## Verification

- Unit coverage: protocol mapping, AP conversion, malformed fields, physical forms,
  exact-level skill unlocks, preset/rotation validation and second-cycle depletion.
- Browser coverage: view switching without draft writes, explicit copying with
  recovery preset, importing before formation setup, reimport instructions,
  rotation persistence/loading, stable desktop geometry, production floor
  positions at 320px, zoom/drag selection, fullscreen keyboard access and containment.
- Timetable/summary coverage: modal focus and nested dropdown Escape, empty numeric
  edits, real preset options, stable header placement, weighted rotation output,
  second-cycle exhaustion and calculation switching without staffing changes.
- Existing base tests retain light-theme contrast, mobile touch targets, roster
  filtering and team remove-button checks.
