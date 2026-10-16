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

The list orders Manga after Vignettes, with Operator Records and Modules last. It
mounts 48 cards initially and appends batches as the reader approaches the end;
the shared LoadOnScroll component also follows keyboard focus to the last card.
Filtering searches the complete catalogue and resets only the rendered batch.
Images use the shared native lazy loading component with reserved dimensions.

Artwork is projected on the server: published operator portraits for records and
modules, content-ID art and event posters for chapters/modes, then mapped canvas
art and the reader's cover manifest. The optional cover refresh preserves its
previous snapshot on failure. Cover images are Arknights game art; mappings come
from https://arknights.timo.beer/json/covers.json. No wiki descriptions are copied.
Existing asset projections are retained; legacy Timo image hotlinks are reprojected
onto mirrored assets. Older releases are enriched by the deployment until the next
dev content release carries their own artwork.

Complete chapter imports carry `completeLibrary: true`. Until that marker reaches
a page, missing off-canvas chapter groups are filled from the deployment snapshot;
published groups keep their own section indices. A complete catalogue owns its
omissions, so removed groups are not resurrected by the fallback. This keeps a
compile-only refresh from pairing a full dev library with production's canvas-only
chapter table and losing record/module dialogs.

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

## Story cover delivery

Reader cover artwork is mirrored into `arkpedia-image-assets`, never loaded from Timo at runtime.
The independent `story-covers` refresh stage reads Timo's cover manifest, stages missing source
images through `scripts/lib/staged-art.mjs`, and adopts only paths present in the published asset
index. The staged-art publisher encodes them as versioned `story-map/timo-<group>-<version>.webp`
files with source provenance and manifest checksums. An art-source outage keeps previously
mirrored covers and does not block the chapter catalogue. New main-story chapters absent from
the community canvas prefer their reader cover to a stage/event banner; their popups fall back
to that same library artwork. Existing canvas cover geometry is preserved.
