# Sponsored slots

A sponsored slot is one image and one link in the page's flow, labelled "Sponsored". No
third-party script runs, and nothing is sticky, fixed or laid over content.

| Placement | Where | Creative shape |
| --- | --- | --- |
| `home` | Home page, last panel of the left column (last of all on a phone) | wide panel, 3:1 |
| `spend` | Under the content of `/pulls` and `/gacha` | strip, 4.5:1, at most 900 px wide |
| `support` | The "Our sponsor" section of `/support` | the same strip |

`/skins` has no slot: its gallery grows as the reader scrolls, so nothing can stand under it.

## Where things live

- **Campaigns:** arkpedia-data `source/data/sponsor-campaigns.json`, which reaches pages as the
  `sponsor-campaigns` release table (`lib/content/tables.mjs`). Starting, swapping or ending a
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

On `/` and `/gacha` the server renders from the request clock, so a campaign outside its window
is never in the HTML. `/pulls` and `/support` have no request clock: the server renders any
active campaign and the browser removes one outside its window after mount. Those slots are last
on their pages, where removing them moves nothing above.

## Reviewing a draft

`draft` campaigns render in `npm run dev` and in a build made with `NEXT_PUBLIC_SPONSOR_PREVIEW=1`,
labelled "Sponsored · draft preview", with or without a link and whatever their dates. Never set
that variable on the public site.

A malformed record throws from the page's table loader (`checkSponsorCampaigns`), which stops the
release that carries it: an active campaign without a link, a date without a timezone, an image
outside `/advertisements/`.

## Adding a sponsor's artwork

1. Add the files to arkpedia-image-assets as its `ADDING-ASSETS.md` describes, and merge.
2. Add the campaign to `sponsor-campaigns.json` as `draft`; review it locally.
3. Fill in `url`, `startAt` and `endAt`, set `status` to `active`, and release the data.
