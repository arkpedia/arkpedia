# Server time and request clocks

`lib/time/servers.mjs` is the shared server-time policy for browser code, server rendering and plain Node pipeline scripts. Its declaration twin is checked against the runtime exports. `scripts/lib/server-day.mjs` re-exports the catalogue API for existing script callers; it contains no separate arithmetic.

| Meaning | API | Convention |
| --- | --- | --- |
| Wall clock / calendar date | `serverCalendarTime`, `serverDay` | The owning server's fixed UTC offset. Read shifted Date values with UTC getters. |
| Gameplay date / weekday | `serverDate`, `serverWeekday`, `toServerTime` | The date rolls over at that server's daily reset. |
| Daily / weekly reset | `getNextDailyReset`, `getNextWeeklyReset` | Strictly after the supplied instant. At reset, the next target is a full day/week ahead. |
| Date-only boundary | `serverDayBoundary`, `serverInstant` | Place a calendar date at midnight, reset or the estimated event opening. |
| Navigation display | `serverClockAt`, `serverOffsetLabel` | Uses the same profile and reset calculation. |

EN uses fixed UTC−7; JP/KR use fixed UTC+9; CN ingestion uses fixed UTC+8. These never follow the host's daylight-saving rules. Midnight and reset are distinct: EN's wall-calendar midnight and 04:00 rollover occur at different instants. Keep that distinction when comparing source release dates, daily missions and calendar months.

The selected imported account (`useAccount().server`, default EN) supplies the navigation, supply rotation, daily/weekly income, certificate month calculations and account card. Do not save a second independent timezone setting. Account switches must update consumers without discarding manual plans or progress.

`contentPageClock` supplies the request instant for the first render. `useReaderClock` updates it after mount and, where needed, on focus or a timer. These transport the current instant; server offsets and reset rules remain in `servers.mjs`. Never read a fresh clock during an SSR/hydration render.

Exact announcement/client timestamps always win. Event/banner/skin records currently carry Global and CN schedules; switching to a JP/KR account does not turn a Global announcement into a Japanese/Korean schedule. The Pull Planner labels this scope, and the ticker labels its existing Global SSS anchor. New regional schedules must carry their own first-party timestamps. Certificate month calculations retain the existing wall-calendar boundary convention; a change to the shop's reset-hour convention needs separate source evidence.

Validation includes reset-boundary and month-boundary unit cases, four host timezones including DST transitions, and a desktop/mobile browser case switching JP → KR → EN → JP on Supplies. Use fixtures in fresh browser contexts, never real account storage.

References: [official JP daily-mission FAQ](https://www.arknights.jp/contact-1-hint), [official EN reset notice](https://www.arknights.global/news/4814), and [official KR campaign reset notice](https://2ndanniv.arknights.kr/preparation). Campaign-specific event times still come from each campaign's own notice.
