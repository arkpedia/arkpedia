# Repository map

## Private application: `arkpedia/arkpedia`

| Folder | Responsibility |
| --- | --- |
| `pages/` | Public URLs, page composition, static props, and API endpoints. Paths follow Next.js routing. |
| `components/<feature>/` | Feature UI and its colocated CSS modules. Shared controls live in `ui/`; site navigation in `layout/`. |
| `lib/<feature>/` | Data access, calculations, and reusable logic. React hooks live in `hooks/`; database access in `server/`. |
| `styles/<feature>/` | Feature-wide global styles. Shared tokens and theme live in `core/`. |
| `data/` | Game records, curated content, and checked-in data snapshots. `assets/` holds media indexes; `survey/` contains the private raw poll export. |
| `public/` | Site files and generated JSON delivery payloads. Image URLs redirect to public asset repositories. |
| `scripts/` | Data builds/imports/sync, tests, audits, and developer tools, grouped by task. |
| `database/` | SQL schema for the survey submission API. |
| `docs/features/` | Maintained feature behavior and validation notes. |
| `docs/development/` | Setup and data pipeline documentation. |
| `docs/archive/` | Historical reviews and superseded preview notes; not current implementation requirements. |

Pages remain in `pages/` because their paths define public URLs. Their components and styles live under feature folders; moving a component should never require changing a URL.

## Find a feature

| Feature | Pages | Components | Logic | Global styles |
| --- | --- | --- | --- | --- |
| Operators | `pages/operators/` | `components/operators/` | `lib/operators/` | `styles/operators/` |
| Planner | `pages/planner.tsx` | `components/planner/` | `lib/planner/` | `styles/planner/` |
| Stages | `pages/stages/` | `components/stages/` | `lib/stages/` | `styles/stages/` |
| Enemies | `pages/enemies/` | `components/enemies/` | `lib/enemies/` | `styles/enemies/` |
| Music | `pages/music/` | `components/music/` | `lib/music/` | `styles/music/` |
| Games | `pages/games/` | `components/minigames/`, `components/music-guesser/` | `lib/minigames/`, `lib/guesser/`, `lib/music-guesser/` | `styles/games/` |
| Schedule | `pages/schedule.tsx`, `pages/events/` | `components/schedule/` | `lib/schedule/`, `lib/events/` | `styles/schedule/` |
| Skins | `pages/skins.tsx` | `components/skins/` | `lib/skins/` | `styles/skins/` |
| Recruitment | `pages/recruitment.tsx`, `pages/recruitment/` | `components/recruitment/` | `lib/gacha/recruitment*.ts` | `styles/recruitment/` |
| Base | `pages/base.tsx`, `pages/bases/` | Page-local UI | `lib/base/` | `styles/base/` |
| Survey | `pages/results.tsx` | `components/survey/` | `lib/results/`, `lib/survey/` | `styles/survey/` |

## Public repository ownership

| Repository | Contents and entry points |
| --- | --- |
| [arkpedia-image-assets](https://github.com/arkpedia/arkpedia-image-assets) | Icons, maps, banners, covers, and UI art. Delivery folders remain at the root to preserve URLs. `originals/source-art/` preserves manual captures; `sources/` records provenance. |
| [arkpedia-skin-assets](https://github.com/arkpedia/arkpedia-skin-assets) | Artwork by rarity, full-resolution `originals/`, responsive `variants/`, manifests, and artwork sync tooling. |
| [arkpedia-color-palette](https://github.com/arkpedia/arkpedia-color-palette) | Generated palette data and community corrections under `palettes/`; see its contribution guide. |
| [arkpedia-voice-japanese](https://github.com/arkpedia/arkpedia-voice-japanese) | Japanese voice clips. |
| [arkpedia-voice-mandarin](https://github.com/arkpedia/arkpedia-voice-mandarin) | Mandarin voice clips. |
| [arkpedia-voice-english](https://github.com/arkpedia/arkpedia-voice-english) | English voice clips. |
| [arkpedia-voice-korean](https://github.com/arkpedia/arkpedia-voice-korean) | Korean voice clips. |
| [arkpedia-voice-regional](https://github.com/arkpedia/arkpedia-voice-regional) | Regional and alternate voice clips. |

Voice repositories use `current/` for current recordings and `legacy/<upstream commit>/` for preserved recordings. Those revision folders are provenance, not temporary clutter.

[`arkpedia-data`](https://github.com/arkpedia/arkpedia-data) owns reviewed game records in `source/` and generated runtime payloads in `release/`. The application reads a validated, immutable release selected by `live/current.json`. See [runtime content](development/runtime-content.md). Application `data/` records are a bundled build/development fallback, not a separately maintained canonical dataset. Refresh jobs hydrate them from `arkpedia-data` before compiling. Raw poll submissions stay private.

## Adding or changing artwork

Publish game images to the appropriate asset repository, update `data/assets/external-asset-index.json`, and run `npm run check:assets`. `next.config.js` retains compatible site image URLs through redirects. Keep original captures in the image repository's `originals/source-art/`, with source notes.

Manual importers stage new captures under ignored `.cache/source-art/`; publish these to the image repository before discarding the cache. The app does not need source captures for a normal build.

## Placement rules

- Start with an existing feature folder; create a new one only for a new feature.
- Keep component-only CSS beside its component. Import global styles through `pages/_app.tsx`, preserving cascade order.
- Use `lib/` consistently; do not add a parallel `libs/` or a catch-all `utils/`.
- Run tools from the repository root, preferably via npm commands. Keep shared tooling helpers in `scripts/lib/`.
- Put current behavior in `docs/features/`. Put dated investigations and replaced designs in `docs/archive/`.
- Preserve public asset paths. Moving GitHub-hosted delivery files breaks existing deployments and external links.
