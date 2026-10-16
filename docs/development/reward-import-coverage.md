# Imported reward completion

The tracker imports received rewards, not merely eligibility. No raw account response or credentials are retained for this feature. Reimport after upgrading to populate newly supported claims; old normalized backups cannot reconstruct fields they never stored.

| Source | Evidence used | Tracker identity |
|---|---|---|
| Mission records | Collected state 3 | `free:<mission id>` |
| Guide groups and long-term sign-in | Explicit received flag | `free:<group id>` |
| Monthly sign-in | Group ID plus binary received history | `free:<group id>:<day>` |
| Basic/all-player event sign-in | Activity ID plus binary received history | `free:<activity id>:<day>` |
| Login-only gift | Explicit received flag | `free:<activity id>` |
| Free level-up pack | A positive received count in `shop.GP.level.info` | `free:GP_freeL_<level>` |
| Global beginner sign-in | Received history plus the programme selected by registration date from the Global schedule | `free:<programme>:checkInData:<day>` or `chainLoginData` |
| Stage first-clear Originite | COMPLETE (3); PASS (2) stays an ordinary clear | Existing chapter/event/resource identities |

`canCheckIn`, `nowIndex`, level thresholds, available-pack lists, elapsed time, and mission state 2 do not establish receipt. Missing, ambiguous, malformed or unsupported fields remain unknown. Announcement-only gifts, welcome mail, voting/community bonuses and beginner programmes without a matching regional schedule stay manually tracked. A Global programme schedule is never guessed for JP/KR.

The catalogue carries historical beginner missions and sign-ins separately from its current default collection. Global accounts see the programme selected by registration date in both Reward Tracker and Pull Planner totals. Unknown or JP/KR registration schedules retain the default manual view. Historical receipts are never relabelled as the newer selector reward.

Reimport replaces only marks attributed to previous imports, preserving manual stage/event/free-reward decisions. Partial snapshots retain prior verified claims. Switching to a demonstrably different account drops prior automatic marks while keeping manual ones. Existing progress without provenance is conservatively treated as manual. Manual changes after an import remain in control until another import reapplies verified claims.

Public schema references: [PlayerCheckIn](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_check_in.py), [PlayerActivity](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_activity.py), [PlayerGiftProgressPerData](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_gift_progress_per_data.py), and [PlayerStageState](https://github.com/baiqwerdvd/torappu-excel/blob/bc6e6155ccb61f8028b1b09209919052e8a9704c/src/torappu_excel/torappu/player_stage_state.py). Synthetic regression fixtures verify normalization, unknown fields, manual marks, account changes, backups, reimport and idempotence. These are not authenticated game-account tests.
