# Kukki feedback implementation

Branch: `feature/kukki-feedback`. Local review only; this branch has not been published or deployed.

Implemented:

- Home stage states: closed red, ending yellow, starting green; no boosted-material copy; featured operator previews.
- Operator pages: selected-outfit chibi viewer, facing/animation/pause controls, EP playback first in the music queue, inline mastery priorities and guide jump, summon base stats, explicit special voice outfit selector.
- Roster: Techniques, Synergies and Obtain Method share one larger-button row.
- Searchable Artists and Voice actors databases, with operator credits and links.
- Recruitment: native EN/JP/KR/CN labels retain the Global pool and canonical selections; 12–22px text sizing travels with the pop-out state.
- Pull history: separate CSV per banner, retaining the full-history export.
- OP tracker: a fully uncompleted presentation view with temporary completion controls; saved progress remains intact.
- Operator planner: Missing/All in Simple mode, material rarity fills, and selected-goal summary filtering without changing saved goals or full-plan material coverage.
- Skin planner: returning shops, open event sections, Fashion Review inventory behind its button, twelve-card loading batches, full-screen art/animated previews, separate + Plan control, owned outfits last within each event.
- Pull Planner: explicit monthly yellow-cert budgets, actual sequential shop tiers, skipped months, and a single shared owned balance.
- Account clock: selected EN/JP/KR account controls server time and reset labels.
- World: the eight sections from the requested right-hand Canva area, country-filtered offline events, latest YouTube videos and creator links, Twitch cards, Discord links, and source-credit gallery fields.
- Offensive/Defensive Recovery techniques derive from the skill recovery field.
- Acquisition corrections: Steward is not recruitment-only; Adnachiel, Purestream and Estelle are.

Content and asset limits:

- The 18 declared special outfit voice sets are present, with clip URL templates. No missing set was found; the new outfit selector makes these discoverable. One pinned Japanese recording from every outfit set was checked: all 18 returned HTTP 200. Every remote audio clip was not individually replayed.
- Battle chibi pointers cover 519 of 520 catalogue outfits. Sora's Summer Flowers FA361 battle model is absent from the reviewed inventory. The viewer explicitly says unavailable for that outfit. Native renders checked include Thorns default and Blade-cleaved Tides (front/back), and Skadi the Corrupting Heart's Red Countess (single facing).
- Chibis use the existing licensed Spine 3.8 runtime and native game exports. Dormitory `build_` models are excluded. The idle camera ignores invisible effect slots, and closing/switching the viewer releases its WebGL resources.
- Summons show base stats before operator talents, skills and modules; inherited bonuses are not simulated.
- World cosplay, fan-art and fan-music sections need curated creators/posts. Web events also have no curated records yet. Existing feeds and offline events remain source-driven; no profiles or posts were invented.
- Kukki's own content checklist (recommendations, milestones, IS helper, selectors, build advice, Base Optimizer) is informational and excluded.

Data provenance:

- Global character tables and EN/JP/KR recruitment tags: `ArknightsAssets/ArknightsGamedata` commit `33bb332c60707419be7fdabbf0c49097cce77350`.
- CN character/skin/tag tables: `Kengxxiao/ArknightsGameData` commit `a550f5e048bb94e7cdefc6eb97a4091f0c4c7add`.
- Default battle exports: `arkpedia/arkpedia-sd-assets` commit `dd162e60112e74d33538eb8796d6b20dad160fd2`.
- Outfit battle exports: `fexli/ArknightsResource` commit `d0b5af0b004b044d322397ce5ae79632b6d9fcdd`.
- Chibi index rebuild: `node scripts/build/build-chibi-index.mjs <SD manifest> <Spine subtree inventory> <skin_table.json> <SD commit> <Spine commit>`. Both inventories must match their commits.
- Summon stats rebuild automatically in the stage refresh, with `scripts/build/build-operator-summons.mjs`; `ARKPEDIA_EN` and optional `ARKPEDIA_CN_CHARACTERS` select alternate game-table inputs.

Validation logs are kept under `/tmp/feedback-*.log`; visual evidence is under `.cache/feedback/screenshots/` in this checkout. Validation after updating the branch onto main release `dbd446cc`:

- `npm test`: 1,245 passed, three existing skips, zero failures.
- `npm run typecheck`, `npm run lint`, `npm run check:styles` and `npm run check:payload-budgets`: passed. Lint retains existing warnings.
- `ARKPEDIA_CONTENT_DISABLED=1 ARKPEDIA_YOUTUBE_FEED_FIXTURE=tests/fixtures/youtube-feeds.xml npm run build`: passed, including clean deployment traces and no game data compiled into browser chunks.
- Production-built Playwright feedback/planner/pulls/music suites: 88 passed, 44 conditional platform skips, zero failures. The earlier dev-server timing failures did not reproduce in production.
- Final queue refinement: an EP removed from a shortened queue is restored first without changing the order of the other songs. The production build and typecheck passed again; feedback and music-resume browser suites passed 29 checks, with seven conditional mobile skips.
- Production fixture feeds are deterministic examples for local browser testing; external creator feeds still run normally outside the fixture environment.

Chibi follow-up: the compact header keeps Front/Back on the right of Chibi Viewer. Animation selection and pause state survive a facing change; each model gets a fresh WebGL canvas so disposing the old context cannot blank the next facing. Dragging the chibi out of the viewer (mouse or touch), or choosing Walk on page, places it over the page. It roams within the viewport, supports re-dragging, pause, keyboard arrows and Escape, and can return to the viewer. Leaving the operator page or closing the viewer removes it. The selected battle animation is preserved while roaming uses the exact outfit's dormitory Move animation where available. The pinned catalogue now includes matching dormitory exports for 1,323 of the existing 1,378 skin-ID records; existing battle model URLs are unchanged. Six focused desktop/mobile browser checks and three asset-generation checks pass, including native WebGL rendering, animation retention, mouse/touch drop position, movement, pause and navigation cleanup.

This follow-up also passed the production build, typecheck, focused lint, style coverage and payload budgets. All six browser checks pass against the production-built local preview on port 3313. Screenshots: `.cache/feedback/screenshots/chibi-header-mobile.png` and `chibi-roaming-mobile.png`.

Skin-section follow-up: events use plain, always-open headings in the normal and Fashion Review views. Event/card batches grow automatically as the reader scrolls. Artwork now gets an image URL only within the shared loader's 600px preload distance, while its aspect-ratio frame stays reserved. Full-screen details, separate + Plan actions, owned ordering and the shared Pull Planner wishlist are retained. Production build, typecheck, focused lint and style coverage passed; eight shared loader/image source checks and twelve focused desktop/mobile browser checks passed. Screenshots: `.cache/feedback/screenshots/skin-sections-{normal,fashion}-{desktop,mobile}.png`.
