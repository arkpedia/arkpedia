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
| `stage-pipeline/` | Existing stage extraction pipeline and its helpers. |
| `lib/` | Shared CSV, game-text, and upstream-sync helpers. |
| `deploy/` | Vercel build selection and safe production deployment scripts. |

## Common commands

```sh
npm run check:local
npm test
npm run test:py
npm run audit:unused
npm run check:styles
npm run check:assets
npm run stages:refresh
npm run events:sync
npm run voices:refresh
npm run palettes:review
```

`predev` and `prebuild` run the browser-payload builders automatically. Refresh commands can download data and rewrite generated records; inspect their diff before committing.

See [pipeline documentation](../docs/development/data-pipelines.md) for prerequisites, source repositories, and refresh order. [Repository ownership](../docs/repository-map.md) explains where imported images and preserved captures belong.

## Code and test hygiene

`check:local` runs the code checks without a Next build or browser server.
Install Python test dependencies with `python3 -m pip install -r scripts/requirements.txt`.
Content refresh's requirements include that shared file plus its heavier import tools.

TypeScript rejects unused locals. `audit:unused` uses Knip with Next/Playwright entrypoints,
manual script entrypoints, fixture refresh tools and the palette review browser script.
Its result must stay at zero; do not hide a real consumer or add an ignore to retain dead code.
JavaScript declaration twins are implicit TypeScript inputs, so a separate test compares
runtime export names and parameter counts. It does not prove semantic return types.
The test inventory checks that every suite has an actual runner, including the separate
production content-runtime checks. Shared global initializers require an explicit owner;
page-sized debug exports such as window.__operators are prohibited.
