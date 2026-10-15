# Story library

`/story` retains the community reading-order canvas. Its **List** view reads
`data/story-library.json`, independently of canvas membership. Categories follow
[Timo's reader](https://arknights.timo.beer/) and its public
[`js/catalog.js`](https://arknights.timo.beer/js/catalog.js): Main Story, Side
Stories, Vignettes, Operator Records, Modules, Integrated Strategies, Reclamation
Algorithm, and Side Content. Official Manga remains a separate category.

`scripts/imports/import-story-chapters.mjs` fetches the reader's English
`json/catalog.en.json` during the existing daily content refresh. The pure
`scripts/lib/timo-library.mjs` transformation reads game review entry types and
the reader's mode, module and extra-story metadata. It never executes downloaded
JavaScript. Both the library and chapter sections are refreshed by the same
stage; that stage no longer depends on a successful canvas import. Failed or
incomplete imports retain the prior files through the existing stage rollback.

The page carries both datasets in its content-release props. For releases
exported before `library` existed, the server attaches the deployment's bundled
library and fills missing chapter groups, preserving existing release sections.
Future content releases carry their own list and require no app redeployment.

Groups keep Timo's original IDs and section indices. List entries with sections
open Arkpedia's existing progress dialog even when the canvas has no cover or
placement. A group without sections links to its reader entry directly; missing
art does not hide a story. Search and category/view choices are URL-backed.

Validation: `node --import tsx --test scripts/tests/test-story-{library,chapters,map,progress}.ts`
and the `story-library`, `story-chapter`, and `story-progress` browser specs.

## Cross-device progress scope

The supplied screenshot was visually verified by the parent task. It depicts
account-free story-progress sync: start syncing, pair another device using a QR
or three-name short-lived code, then retain a recovery code. This is a separate
feature from the categorized library and has not been implemented here.

The current Arkpedia store (`lib/story/storyProgress.ts`) saves read section IDs
in localStorage, with same-origin tab updates and JSON import/export. Game-account
imports are not an Arkpedia sync identity. The repository has Next API routes and
a survey-oriented Postgres schema (`database/schema.sql`); it has no story-sync
schema, device-pairing endpoint, or recovery mechanism. Repository configuration
does not establish whether a suitable production database is provisioned.

A matching account-free service would need durable progress records, protected
device/recovery secrets, expiring pairing sessions, authorization of each device,
and merging of read/unread changes including offline edits. The user would save
the recovery code. The app would save progress and pairing/recovery state on a
backend; a browser-only implementation cannot synchronize independent devices.
Storage provider, retention, recovery and revocation behavior need an agreed
scope before implementation. No auth, security, or storage infrastructure was
added in this change.
