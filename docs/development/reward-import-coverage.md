# Imported reward completion

The tracker imports received rewards, not merely eligibility. No raw account response or credentials are retained for this feature. Reimport after upgrading to populate newly supported claims; old normalized backups cannot reconstruct fields they never stored.

| Source | Evidence used | Tracker identity |
|---|---|---|
| Mission records (GUIDE, MAIN, SUB, OPENSERVER, ACTIVITY, RETRO) | Collected state 3 | `free:<mission id>` |
| Welfare operator from event missions | ACTIVITY mission collected (3), e.g. `51sideActivity_4` | `free:<mission id>` |
| Welfare operator from a main-story event's permanent missions | RETRO mission collected (3), e.g. Viy's `act4mainssPermanent_5` | `free:<mission id>` |
| Welfare operator from Record Restoration | `retro.trail[<retro id>][<trail reward id>]` = 1 | `free:trail:<retro id>:<trail reward id>` |
| Guide groups and long-term sign-in | Explicit received flag | `free:<group id>` |
| Monthly sign-in | Group ID plus binary received history | `free:<group id>:<day>` |
| Basic/all-player event sign-in | Activity ID plus binary received history | `free:<activity id>:<day>` |
| Login-only gift | Explicit received flag | `free:<activity id>` |
| Free level-up pack | A positive received count in `shop.GP.level.info` | `free:GP_freeL_<level>` |
| Global beginner sign-in | Received history plus the programme selected by registration date from the Global schedule | `free:<programme>:checkInData:<day>` or `chainLoginData` |
| Stage first-clear Originite | COMPLETE (3); PASS (2) stays an ordinary clear | Existing chapter/event/resource identities |
| Paradox Simulation | COMPLETE (3) in `troop.addon[operator].stage[stageId]`; rewards arrive with the battle result | `paradox:<stageId>` |

Paradox stage records live in the operator handbook, separately from `dungeon.stages`. Unlock timestamps, attempts, clear counters and Operator Record story entries do not establish a completed Paradox reward. Reimport once to populate this field in accounts saved before this mapping was supported. Manual tracker marks survive.

`canCheckIn`, `nowIndex`, level thresholds, available-pack lists, elapsed time, and mission state 2 do not establish receipt. Missing, ambiguous, malformed or unsupported fields remain unknown. Announcement-only gifts, welcome mail, voting/community bonuses (`CHECKIN_VS`, `pubBhvs`), welfare operators from an event's own data (milestones, exploration, investments: `free:welfare:<activity>:<operator>`) and beginner programmes without a matching regional schedule stay manually tracked. An official post that announces a client sign-in under its own title (same day-by-day item counts, opening within a day) is that sign-in, so it has no second, unimportable set of rows. A Global programme schedule is never guessed for JP/KR.

Welfare operators are derived from the Global tables (scripts/build/build-free-rewards.mjs): `activity_table.missionData` CHAR rewards (open from the event's start to its stages' end), `mission_table` RETRO missions linked to their event by `retro_table.retroActList` (open from the event's start, no end), and `retro_table.retroTrailList` (from `trailStartTime`, no end). Every operator an event mission page features (`activityTemplateMissionStyles` ILLUST_CHAR_REWARD) must have a row or the build fails. Stage first-clear operators are the tutorial's and the first chapters', and Global event stores sell only tokens, so neither is a welfare row.

The catalogue carries historical beginner missions and sign-ins separately from its current default collection. Global accounts see the programme selected by registration date in both Reward Tracker and Pull Planner totals. Unknown or JP/KR registration schedules retain the default manual view. Historical receipts are never relabelled as the newer selector reward.

Reimport replaces only marks attributed to previous imports, preserving manual stage/event/free-reward decisions. Partial snapshots retain prior verified claims. Switching to a demonstrably different account drops prior automatic marks while keeping manual ones. Existing progress without provenance is conservatively treated as manual. Manual changes after an import remain in control until another import reapplies verified claims.

Public schema references: [PlayerCheckIn](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_check_in.py), [PlayerActivity](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_activity.py), [PlayerGiftProgressPerData](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_gift_progress_per_data.py), and [PlayerStageState](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_stage_state.py). Synthetic regression fixtures verify normalization, unknown fields, manual marks, account changes, backups, reimport and idempotence. These are not authenticated game-account tests.

Paradox protocol references: [PlayerTroop.addon](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_troop.py), [PlayerHandBookAddon.StageInfo](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_hand_book_addon.py), and [battle-result first rewards](https://github.com/AdoreJc/ArknightsDB/blob/main/source/dump/Torappu/HandBookAddonStageBattleFinishResponse.md). The regression fixture uses the handbook nesting and catalogue producer together, then verifies tracker persistence and manual marks in desktop/mobile browsers.
