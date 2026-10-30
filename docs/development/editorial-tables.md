# Editorial tables

Reviewed content lives in arkpedia-data's `source/data/`, edited on `editorial`. The app keeps the interpretation, types and UI. Publish the records before deploying code that imports a new record; the next content release then carries changed values without an application deployment.

| Record | Consumers |
| --- | --- |
| `event-announcements.json`, `event-pack-art.json` | Event reward and pack previews; selector catalogue |
| `selector-ratings.json`, `selector-tickets.json` | Current selector catalogue |
| `community-web-events.json`, `community-offline-events.json` | Community and home event listings |
| `mode-details.json` | Event mode descriptions |
| `music-guesser-event-music.json`, `music-guesser-event-expansion.json`, `music-guesser-main-story.json` | Music guesser catalogue |
| `stronghold-opening.json`, `stronghold-playbook.json` | Stronghold opening advice and build-time season validation |
| `youtube-creators.json` | Community creators, home/community video feeds, live search feeds, and the generated search index |
| `community-projects.json` | Community directory descriptions, links and logo paths |
| `selector-super-meta.json` | Selector personalization and coverage scores |
| `patreon-supporters.json` | Support page's public supporter names |

Browser consumers receive their records in `__contentTables` through `withContentPage` and `useReleaseTable`. Both Stronghold routes declare the opening table because the main mode page embeds the companion too. The Stronghold export rejects advice naming operators, alliances, items or strategies absent from that season. Selector scoring takes the release's explicit operator list; it imports no editorial data into a browser chunk.

YouTube creator channels are a curated directory, distinct from `guide-creators.json`'s title-matching rules and the official-news channel catalogue. Runtime feed readers use the same verified `/community` release table; exports use their local source record. New routes `/support` and `/community/projects` also regenerate from their bundled builders while a release predates them.

The project directory's wiki link is held in its `wiki` field; its host supplies the displayed platform. Application-owned asset pins and the two showcase chibi models remain in `config/community-project-art.json`. Changelog entries and technique matchers remain application code by design.

The importer also owns `data/profile-avatars.json`. The existing picker remains in place until this source is published; its reader switch follows separately. The app copies it to the generated `public/profile-avatars.json` for its local fallback and includes that file in each release manifest. A source record alone is insufficient: the browser URL must be exported too.

## Adding a table

1. Add the record to arkpedia-data's editorial source, retaining reviewed values and provenance.
2. Declare every browser consumer in `lib/content/tables.mjs` and provide matching server loaders that return the JSON module's `.default`.
3. Include new routes in `scripts/content/pages.json`, and cover old-release behavior in `test-previous-release-props.ts`.
4. Keep dynamic import loaders server-only. Do not expand the browser-bundle guard's allow lists.
5. Advance browser fixture data deliberately once the source records are published, then check the affected pages on desktop and phone.
