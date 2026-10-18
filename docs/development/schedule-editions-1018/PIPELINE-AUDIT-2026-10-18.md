# Schedule event editions — 18 October 2026 KST

The reported defects are confirmed and repaired on review branches. Production has not been promoted. The local preview is http://localhost:3188/schedule, with corrected canonical source records mirrored into the app's development fallback.

## Scope and revisions

App base: `arkpedia/arkpedia` main `3097c8fa2`; source base: `arkpedia/arkpedia-data` editorial `95cb7288`; image base: `arkpedia/arkpedia-image-assets` main `e1b15ecb`. App branch `fix/schedule-event-editions`; data branch of the same name; artwork branch `fix/schedule-event-art`, commit `4aae1c5d28fe7d9c171bbdc80840bc31614d22c3`.

Live reproduction: https://www.arkpedia.net/schedule. The list showed Orienteering #7 on October 18–November 1, Relaunch Anchor as a drawer-only launch, and empty Ato rerun / Interactive Exhibition art. The supplied Masses' Travels screenshot agrees with the release matcher: originals and reruns were deliberately conflated.

## Handoffs and verdicts

| Producer | Transform | Consumer | Result |
| --- | --- | --- | --- |
| Skin release text; explicit CN rotations and Global inventories | `scheduleSkinMatch`, `eventSkins` | Event pages and schedule drawers | **Broken on live; verified working locally:** edition markers stay distinct, explicit inventories supply reissues, complete Global inventory overrides CN. |
| CN activity/stage/building tables | `build-event-rewards.mjs` | `event-rewards.json`, event Rewards tab | **Broken on live; verified working locally:** pending reruns were excluded from CN import; they now resolve their own activity before original-run fallback. |
| Official CN post images | Catalogue media planning and existing artwork publisher | Asset manifest → release index → event posters | **Broken on live; verified working locally:** existing null-poster activities now receive an import plan. Three decoded images were added with provenance and observed loading at natural width 1560. |
| Permanent-mode launch records | Event path generation and overview | Schedule link → `/events/[slug]` | **Not implemented on live; verified working locally:** Relaunch Anchor opens a full page, with unlock requirement, mode description, CN reward highlights and source. |
| Global client gacha table | Global pool reconciliation, forecast suppression | Gacha/schedule preview | **Verified source absence:** no Global Orienteering #7 pool at the checked pin. October 18 projection is withdrawn, not replaced with another guessed date. A later real Global pool clears the withdrawal. |

## Corrections and sources

- Masses' Travels rerun uses `act42sre`, not original `act42side`. Its ordinary outfit gallery contains only Sankta Miksaparato / Caelum Aeternum; Kroos / Moonlit Voyage and PhonoR-0 / Primordial Ode do not belong to the rerun. [Official CN rerun notice](https://ak.hypergryph.com/news/3044) also confirms the outfit sale ends June 5, after the June 1 stage close. The CN rotation's shop close was corrected accordingly.
- Rebuilt the four CN-2026 reruns with their own tables: Masses' Travels (`act42sre`), A Flurry to the Flame (`act24sre`), Act or Die (`act43sre`), and Ato (`act44sre`). Own missions, first clears and furniture replace inherited original groups. An identified activity cannot silently fill missing groups from its original. First-clear rewards remain once per account.
- Relaunch Anchor (`sandbox_2`) is permanent, not a timed side story. Its full page retains an estimated Global launch and separately labels CN requirements/rewards. [Official CN announcement, Part 2](https://ak.hypergryph.com/news/3046) confirms May 15 launch, clear 3-8 requirement, Mountain's outfit and the named cosmetic rewards. The official [mode site](https://ak.hypergryph.com/ra/relaunchanchor) is another first-party reference.
- Imported official images for Relaunch Anchor, [Ato rerun](https://ak.hypergryph.com/news/7369) and [Interactive Exhibition, Part 2](https://ak.hypergryph.com/news/8571). Masses' Travels already had its own rerun image in the asset repository but referenced the original-run path; the source now selects the rerun file.
- Existing events with a stable activity ID and null poster now get media plans even if today's wiki row has no exact client-date match. This fixes the creation-only import gap. The RA release configuration also names the new poster, so its importer cannot restore the OST cover on the next refresh.

Pinned tables used for rebuilding and verification:

- [CN activity table](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/bee3f83c5d60590b5e1cd42b8d09d00ce32ab10d/zh_CN/gamedata/excel/activity_table.json), with stage, item, building, character, skin, display-meta and charm tables at the same commit.
- [Global gacha table](https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/db6f9ef8046ad17dbebe3ff1d0dd88844a5bc78c/en/gamedata/excel/gacha_table.json), checked October 18. It includes the October 23 Standard pool and October 20 Kernel Locating pool, but no seventh Global Orienteering pool. The CN candidate list is not a Global lineup.

## Validation and review evidence

143 related tests passed together; the final withdrawal-resurrection regression passed with the affected suite. Catalogue tests include a persisted activity whose missing poster previously remained blank. Typecheck and focused lint passed. The existing content-export workers produced 206 event detail pages and one schedule page without export-clock errors.

Browser QA used the local branch with corrected source/fallback records and the immutable artwork commit. Tested desktop 1280×900 and phone 390×844, dark/light layouts, full-mode navigation, reward/skin tabs, and the withdrawn forecast panel. All three imported event posters loaded successfully; the Masses' Travels rerun gallery contained Caelum Aeternum only. No CSS ownership change was needed.

Captures:

- [Masses' Travels rerun skins](masses-rerun-skins-desktop.png)
- [Relaunch Anchor desktop](relaunch-anchor-desktop.png)
- [Relaunch Anchor phone/light](relaunch-anchor-mobile-light.png)
- [Withdrawn Orienteering forecast](orienteering-unannounced-desktop.png)

## Limits and publication order

- Joint Operation 22/23 and Orienteering CN lineup artwork remains intentionally withheld from Global previews until Global evidence exists; supplying CN candidate art as Global art would be misleading. These are separate from the repaired event-poster gaps.
- The Masses' Travels rerun wiki page currently has a Sweet Dream Hall heading but no itemized store rows. No store quantities were copied from the original event or invented. Own missions/first clears/furniture are verified; exact rerun-store stock remains unverified.
- This pass verifies local code, source transforms, exported pages, decoded artwork and browser rendering. CI, merged destination refs, release-pointer adoption and production behavior are not yet verified.
- Review/merge artwork first, then the application importer/rendering changes, then compile the corrected source with the matching compiler and asset revision on dev. Production promotion requires the user's explicit release instruction. Source changes remain on a non-editorial review branch so the ten-minute editorial publisher cannot publish them prematurely.
