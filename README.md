# Operator Power Survey (Next.js + TypeScript)

## Setup
1. `npm install`
2. Drop your operator PNGs into `public/operator_icons/` (filename = operator name, e.g. `Aak.png`)
3. Create a Postgres database (e.g. neon.tech free tier), run `schema.sql` against it
4. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`
5. `npm run dev` to test locally

## Deploy on Vercel
1. Push this repo to GitHub
2. Import into Vercel
3. Add `DATABASE_URL` as an environment variable in the Vercel project settings
4. Deploy

## Testing
- On the form page, a "Populate randomly (dev only)" button appears automatically
  in local dev (hidden in production builds) -- fills every operator with a random
  power or "unable to rate" so you can jump straight to the tier/confirm screen.
- Submit a few times locally (or on a preview deployment, which still runs in dev mode
  for that button) to generate sample data for `/results`.

## Revealing results
`pages/results.tsx` has a `SHOW_RESULTS` boolean at the top. It's `false` by default,
showing a "results not yet available" placeholder to all visitors. When you're ready
to reveal (e.g. one week after launch), flip it to `true` and redeploy.

## Data sources

Everything on the site that states a fact about the game is derived from one of
these, not typed in by hand. The refresh pipeline (`scripts/refresh-stage-data.sh`)
pulls from them; each script's own header says which it uses and why.

| Source | What it provides | Used by |
| --- | --- | --- |
| [ArknightsAssets/ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata) (`en/gamedata/excel`) | The EN client's own tables — `activity_table`, `gacha_table`, `character_table`, `stage_table`, `item_table`, `building_data`. Authoritative for anything global has shipped. | `sync-event-windows.mjs`, `build-content-windows.mjs`, `import-reward-icons.py` |
| [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) (`zh_CN`) | The CN client's tables, for content global has not received yet, and for the CN names needed to search prts.wiki. | CN-ahead lookups |
| [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource) | CN gamedata plus most art: `item/`, `avatar/`, `portrait/`, `enemy/`, `building_skill/`. | `import-reward-icons.py`, material and skill icons |
| [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource) | The wider art set — full character art, story sprites, medals. | one-off art imports |
| [arknights.wiki.gg](https://arknights.wiki.gg) | EN key art (`File:EN <name> banner.png`), and curated tables for things nobody has extracted from the raw data. Numbers here are a lead, not an answer — it lags the live event. | `sync-banner-art.py`, transparent material icons |
| [prts.wiki](https://prts.wiki) | The CN wiki. Best source for interface art the mirrors do not carry (mode emblems, alliance badges, stratagem icons), usually at higher resolution. Filed under CN names. | Stronghold Protocol icons |
| [Arkpedia/arkpedia-voice-assets](https://github.com/arkpedia/arkpedia-voice-assets) | Arkpedia's public voice asset mirror, with its upstream revision recorded in `source.json`. | Operator voice files |

Dates are reconciled against the client tables rather than announcements:
`sync-event-windows.mjs` overwrites estimated windows in `data/events/events_*.json`
and `data/headhunting_banners.json` once `activity_table`/`gacha_table` ship a real
one, which is also what the skins page's availability countdowns are computed from.

## Asset repositories

Large media is kept out of this repository's Git history and served directly from public, purpose-specific repositories. Existing application paths are retained through temporary redirects, so pages do not need to know where an asset is hosted.

| Repository | Contents |
| --- | --- |
| [Arkpedia/arkpedia-skin-assets](https://github.com/arkpedia/arkpedia-skin-assets) | Full operator artwork and skin-series logos |
| [Arkpedia/arkpedia-image-assets](https://github.com/arkpedia/arkpedia-image-assets) | Icons, banners, posters, maps, covers, and other site images |
| [Arkpedia/arkpedia-color-palette](https://github.com/arkpedia/arkpedia-color-palette) | Community-reviewed Color Palette Guesser corrections |
| [Arkpedia/arkpedia-voice-assets](https://github.com/arkpedia/arkpedia-voice-assets) | Operator voice audio by language |

The application keeps `data/external-asset-index.json` so build-time availability checks still cover external media. Next Image optimization is disabled for these paths so the browser follows the redirect to GitHub instead of proxying the media through Vercel.
