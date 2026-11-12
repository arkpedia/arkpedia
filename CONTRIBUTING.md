# Contributing

Please discuss substantial changes in an issue before starting. Keep pull requests
focused and explain the problem, resulting behavior and checks you ran.

## Local development

Use Node.js 22.12 or newer, then run `npm ci` and `npm run dev`. The development
server loads the published game records; no production credentials are needed for
reference pages or local planners. See [Setup](docs/development/setup.md).

Run the checks relevant to your change. `npm run check:local` covers types,
application tests, lint and style checks; see [Setup](docs/development/setup.md) for
Python dependencies. For UI changes, follow the
[design system](docs/development/design-system.md) and check desktop/mobile and
dark/light themes, including the affected interactions.

Use synthetic account fixtures. Do not include real account exports, passwords,
login codes, access tokens, personal data or local environment files in commits,
issues or screenshots. Report security concerns privately using
[the security policy](SECURITY.md).

Game records and media belong in their corresponding
[repositories](docs/repository-map.md). Do not copy generated records or game media
into the application repository.

## Rights

Public visibility does not grant an open-source license. Read
[Code and content rights](RIGHTS.md) before reusing code. Submit only changes you
have the right to share; retain third-party notices and attribution.
