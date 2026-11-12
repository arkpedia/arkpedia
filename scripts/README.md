# Tooling

Run commands from the repository root. npm scripts are the stable entry points.

| Folder | Purpose |
| --- | --- |
| `build/` | Generate data records, asset indexes, and browser payloads. |
| `imports/` | Read upstream tables, CSV exports, and image sources. |
| `sync/` | Orchestrate upstream refreshes and reconcile dates/art sources. |
| `tests/` | TypeScript regression tests for operators, games, recruitment, and techniques. |
| `audits/` | Asset coverage, styles, planner calculations, and data/model audits; baselines live beside their audit. |
| `palettes/` | Palette generation, local review UI, and its Python/TypeScript tests. |
| `particles/` | The particle simulator's golden fixtures (made by the assets repository's reference simulator), their error report, and its benchmark; the particle geometry's golden vertex dumps (`make-vertex-golden.py`, a Python expansion of the reference simulator's particles) and the layers reader's compat fixture (`make-compat.ts`, what the deployed reader draws). |
| `lib/` | Shared CSV, game-text, and upstream-sync helpers. |
| `deploy/` | Vercel build selection and safe production deployment scripts. |

The nightly import's own scripts are not here: they live in arkpedia-data's `importer/`, at the
same relative paths (`importer/scripts/...`, its `docs/importer.md`). A module both repositories
read is a copy at the same path in each, and `scripts/tests/test-importer-copies.ts` fails on a
copy that differs.

## Common commands

```sh
npm run check:local
npm run release:status
npm test
npm run test:py
npm run audit:unused
npm run check:styles
npm run check:assets
npm run stages:refresh
npm run voices:refresh
npm run palettes:review
```

`predev` and `prebuild` run the same `generate:public` browser-payload builders automatically. Only those finite generator processes use production-mode loader caches; `next dev` itself still runs in development. Stage details rebuild from every current input instead of trusting a partial timestamp sample. Refresh commands can download data and rewrite generated records; inspect their diff before committing.

See [pipeline documentation](../docs/development/data-pipelines.md) for prerequisites, source repositories, and refresh order. [Repository ownership](../docs/repository-map.md) explains where imported images and preserved captures belong.

## Code and test hygiene

`check:local` runs the code checks without a Next build or browser server.
Install Python test dependencies with `python3 -m pip install -r scripts/requirements.txt`.
The content run installs that same shared file (`scripts/content/requirements.txt`); the
import's heavier tools are pinned in arkpedia-data's copy of it.

TypeScript rejects unused locals. `audit:unused` uses Knip with Next/Playwright entrypoints,
manual script entrypoints, fixture refresh tools and the palette review browser script.
Its result must stay at zero; do not hide a real consumer or add an ignore to retain dead code.
JavaScript declaration twins are implicit TypeScript inputs, so a separate test compares
runtime export names and parameter counts. It does not prove semantic return types.
The test inventory checks that every suite has an actual runner, including the separate
production content-runtime checks. Shared global initializers require an explicit owner;
page-sized debug exports such as window.__operators are prohibited.


Pipeline JavaScript (`.mjs`, `.cjs`, `.js`) has its own `npm run lint:scripts` gate, using ESLint recommended rules at zero warnings. TypeScript scripts remain covered by the existing strict compiler pass. The script parser is an explicit pinned dependency so JSON import attributes are checked too. Only the runtime browser harness and palette review script enable browser globals for their browser callbacks. Keep the CLI's reusable functions separate from its entrypoint; shared helpers live under `scripts/lib/`, upstream table selection under `scripts/content/cn-tables.mjs`, and release/pin policy under `scripts/content/`. Read pinned upstream records through `pin-upstream.mjs`/`cn-tables.mjs` rather than constructing a moving upstream URL.
