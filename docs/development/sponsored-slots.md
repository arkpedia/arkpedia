# Sponsored slots

A sponsored slot is one image and one link in the page's flow, marked by a small "Ad" tag in the artwork's corner. No
third-party script runs, and nothing is sticky, fixed or laid over content.

| Placement | Where | Notes |
| --- | --- | --- |
| `home` | Home page, a panel directly under Events (the same on a phone) | full column width |
| `header` | Beside a page title on desktop, or below the server clock inside the shared mobile navigation menu | 436.5 × 97 px on viewports wider than 1000 px. The slot sits 16 px from the top and on the right gutter of the page header. The mobile banner scales to fit the drawer. |
| `support` | The "Our sponsor" section of `/support` | at the artwork's own width |

Page content shows at most one slot besides `/support`'s section. The mobile navigation
menu uses the same `header` campaign and can show its dedicated `mobileArtwork` below the clock.
On desktop the shared header reserves room for the banner beside its title and controls.
Headers with longer titles or descriptions can wrap within the remaining width.
The home page, which has its own layout, uses its separate campaign panel.

## Taking turns, and Arkpedia's own banners

Where the `header` placement has more than one usable campaign, they take turns in the same box
every 8 seconds (`useTurn` in `components/ui/SponsoredSlot.tsx`), in the record's order. The
server's HTML always shows the first. The turn waits while the pointer or keyboard focus is on
the slot and while the tab is hidden, and never happens for a reader who asked for reduced
motion. The desktop slot uses a fixed 4.5:1 frame. In the drawer the box keeps the first
campaign's shape, so use artwork of the same proportions there.

A campaign whose `url` is a path on this site (`/music/discover`) is one of Arkpedia's own
banners: it opens in the same tab, is not marked `rel="sponsored"` and carries no "Ad" tag.

## Where things live

- **Campaigns:** arkpedia-data `source/data/sponsor-campaigns.json`, which reaches every content
  page as the `sponsor-campaigns` table (`SITE_TABLES` in `lib/content/tables.mjs`). Starting, swapping or ending a
  campaign is a data release, not a deploy. The record's `about` describes each field.
- **Artwork:** arkpedia-image-assets `advertisements/<sponsor>/`, delivered as WebP, with the
  sponsor's uploaded file kept under `originals/advertisements/`.
- **Code:** `lib/sponsors/campaigns.ts` (validation and selection), `lib/sponsors/strings.ts`
  (every reader-facing string), `components/ui/SponsoredSlot.tsx`, `styles/ui/sponsored-slot.css`.

## What a reader sees

A campaign is shown only while its `status` is `active`, it has an https `url`, and the clock is
inside `startAt`..`endAt`. Without one the slot renders nothing, and `/support` drops the whole
section. The link opens in a new tab with `rel="sponsored noopener noreferrer"`.

The box takes the artwork's aspect ratio before the image loads. If the image never loads (a
content blocker, a failed request) the box keeps its size and holds a line of text, so nothing
below it moves.

An `eventActivityId` takes its window from the corresponding Global event in the content release.
The release compiler includes it once the event has confirmed opening and closing times.
Leave `startAt` and `endAt` null in source for these campaigns.

`withContentPage` attaches the campaigns to every content route (`SITE_TABLES`). The initial
render uses the server time. An open tab switches at the published boundary and catches up when
it regains focus. A malformed record stops the export that carries it. At request time an
unreadable record leaves the slot empty. A page that is not a content route (`/about`,
`/changelog`, `/privacy`, the community video pages) takes the campaigns the live release
published with `/support` and uses that release’s image revisions (`withSiteTables`, `siteTablesStaticProps` in `lib/content/server.ts`).
The error pages and the development-only pages carry none and show no slot.

## Reviewing a draft

`draft` campaigns render in `npm run dev` and on the Preview site (the staging build role sets
`ARKPEDIA_PREVIEW`), with or without a link and whatever their dates. The public site never
shows them.

A malformed record throws when a page's tables are attached (`checkSponsorCampaigns`), which stops the
release that carries it: an active campaign without a link, a date without a timezone, an image
outside `/advertisements/`.

## Adding a sponsor's artwork

1. Add the files to arkpedia-image-assets as its `ADDING-ASSETS.md` describes, and merge.
2. Add the campaign to `sponsor-campaigns.json` as `draft`; review it locally.
3. Fill in `url` and either the fixed dates or the `eventActivityId`, set `status` to `active`, and release the data.

## Campaign dashboard

Open [Arkpedia Admin](https://admin.arkpedia.net). On your first visit, choose passkey setup and verify your enrollment email. Use the saved passkey to sign in. Publishers can
upload page and mobile PNG, JPEG or WebP artwork (600 KiB each), add sponsored
HTTPS links and Arkpedia links, schedule or pause a campaign, restore the data
release version, and refresh the cached homepage, About, Support or Schedule.
The reader checks for campaign changes while the page is visible. A campaign
set to follow the published schedule inherits new event timings automatically.
Violet Orchid's page, menu and homepage artwork stays eligible through the
confirmed opening of Kirin R Yato. Only the page and menu have Kirin artwork.

Use the environment's accounts D1 database with migration
`0025_campaign_editor.sql`. Configure a Cloudflare Access self-hosted
application covering both `/dashboard/*` and `/api/dashboard/*` on the same
hostname with the same audience. The production application protects the entire admin hostname. The account
administrator manages the exact email allowlist in the **Arkpedia campaign editors**
policy in Cloudflare Zero Trust. Select only **Passkeys** for the application. Configure the worker's `ARKPEDIA_DASHBOARD_ORIGIN`,
`ARKPEDIA_DASHBOARD_ACCESS_ISSUER` (team HTTPS origin) and
`ARKPEDIA_DASHBOARD_ACCESS_AUD`. Use separate audiences and databases for
Preview and production. Missing Access configuration denies editor requests.

### Preparing the next event

Select a campaign and choose **Duplicate**, or start with **New draft**. Choose
**Follow a Global event** and select the event by name. Under **At event opening**,
choose the current campaign to replace or keep the other campaigns. A replacement
uses the same placements as its predecessor. The page-header and mobile-menu previews
show both variants, including the fallback when only page artwork is supplied.

**Save draft** keeps the artwork off the live site. Choose **Schedule campaign** to arm it. The incoming campaign waits for a
confirmed Global start and end. Its selected predecessor stays eligible through
a delayed opening, and the incoming campaign ends at the event close. Other
campaigns keep their own schedules. To schedule another handoff, select the
incoming campaign as the next one's predecessor.
