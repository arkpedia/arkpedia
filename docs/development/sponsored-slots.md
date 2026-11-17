# Sponsored slots

A sponsored slot is one image and one link in the page's flow, with no visible label (the owner's choice, 2026-11-18; the link keeps rel="sponsored" and its accessible name says it is sponsored). No
third-party script runs, and nothing is sticky, fixed or laid over content.

| Placement | Where | Notes |
| --- | --- | --- |
| `home` | Home page, a panel directly under Events (the same on a phone) | full column width |
| `header` | The free space to the right of a page's title, on every page that opens with `PageHeader` | shrunk to 84 px tall (252 px wide), the height of an eyebrow, title and one line of lede, on every header; desktop widths only (hidden below 1000 px) |
| `support` | The "Our sponsor" section of `/support` | at the artwork's own width |

A page shows at most one slot besides `/support`'s section. The header slot is laid over the
empty space beside the title and takes no room of its own: the header reserves nothing for it, so
every header and everything under it measures the same with or without a campaign. The slot stays
hidden until it has measured that nothing in the header reaches under it (a long title, a control
in the title row). The operator page's search starts on the information panel's left edge and,
from 1200 px up, ends short of the slot while a campaign runs. The music
pages keep their Endfield music setting in the sidebar, not the title row, to leave that space
free.

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

`withContentPage` attaches the campaigns to every content route (`SITE_TABLES`) and drops the
ones outside their dates at each request, so the server's HTML never holds an expired slot. The
browser does not re-check with the reader's clock, so a slot never appears or disappears under a
reader mid-visit; a campaign's start and end reach a page with its next revalidation. A record
this deployment cannot read stops the export that carries it, and at request time shows no
sponsor instead of failing the page. A page that is not a content route (`/about`,
`/changelog`, `/privacy`, the community video pages) takes the campaigns the live release
published with `/support` (`withSiteTables`, `siteTablesStaticProps` in `lib/content/server.ts`).
The error pages and the development-only pages carry none and show no slot.

## Reviewing a draft

`draft` campaigns render in `npm run dev` and in a build made with `NEXT_PUBLIC_SPONSOR_PREVIEW=1`,
with or without a link and whatever their dates. Never set
that variable on the public site.

A malformed record throws when a page's tables are attached (`checkSponsorCampaigns`), which stops the
release that carries it: an active campaign without a link, a date without a timezone, an image
outside `/advertisements/`.

## Adding a sponsor's artwork

1. Add the files to arkpedia-image-assets as its `ADDING-ASSETS.md` describes, and merge.
2. Add the campaign to `sponsor-campaigns.json` as `draft`; review it locally.
3. Fill in `url`, `startAt` and `endAt`, set `status` to `active`, and release the data.
