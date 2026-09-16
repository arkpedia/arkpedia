# Arkpedia

Arknights reference pages, operator and pull-planning tools, recruitment, music, and guessing games. Built with Next.js Pages Router, React, and TypeScript.

## Start here

- [Repository map](docs/repository-map.md): where to find each feature and which public repository owns its assets.
- [Development guide](docs/development/setup.md): setup, validation, and deployment.
- [Data catalogue](data/README.md): checked-in datasets and generated output.
- [Tooling guide](scripts/README.md): importers, builders, audits, and tests.
- [Documentation index](docs/README.md): current feature documentation and archived design reviews.

## Local development

Use Node.js 20 or newer. From the repository root:

```sh
npm ci
npm run dev
```

Game images and voices load from the public Arkpedia asset repositories. A database is only needed for survey submission; see the [development guide](docs/development/setup.md).

## Verify a change

```sh
npm run typecheck
npm test
npm run lint -- --max-warnings 15
npm run check:styles
npm run check:assets
npm run build
```

`predev` and `prebuild` generate the JSON delivery files under `public/`. Do not commit generated media, build output, credentials, or upstream caches.
