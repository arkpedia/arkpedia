# Patreon supporters

Production refreshes the public acknowledgements on `/support` from Patreon API v2
daily at 04:17 UTC. The first visit after configuration warms an absent snapshot;
subsequent visits only read the stored snapshot. The page displays its update time.

Set these **runtime secrets** on the production `arkpedia` Cloudflare Worker:

- `PATREON_CAMPAIGN_ID`
- `PATREON_CLIENT_ID`
- `PATREON_CLIENT_SECRET`
- `PATREON_CREATOR_ACCESS_TOKEN`
- `PATREON_CREATOR_REFRESH_TOKEN`

Use the campaign creator's credentials, with access to the campaign and its members.
Do not put credentials in build variables, public variables, source files or chat.
Preview and local development never contact Patreon. An unconfigured deployment uses
the existing published `config/patreon_supporters.json` acknowledgements as a fallback.

`lib/patreon/sync.mjs` requests only tier titles/amounts, membership status, display
names and profile privacy. Only active paid members with explicitly public identities
are acknowledged, once under their highest entitled tier. Hidden or masked identities
are omitted; emails, addresses and payment histories are never published. The public
API accepts only the closed names/tiers/update-time projection.

The additive `0019_patreon_supporters.sql` migration stores the public snapshot and
encrypted rotating tokens in a dedicated private D1 table, independent of Arkpedia
accounts. The configured integration can initialize this one table idempotently;
it never alters existing account tables or runs unrelated pending migrations.
A database lease serializes token rotation. New tokens are persisted before
membership requests continue. A failed or incomplete refresh preserves the previous
snapshot and backs off for one hour; the displayed date makes its age visible.
Keep the latest private database state through code rollback so refreshed tokens
are not replaced with expired ones.

Check `/api/patreon-supporters`: 200 means a validated snapshot, 202 means initial
preparation, 204 means not configured and 503 means storage/validation unavailable.
The public route never returns provider responses or credentials. For provider
failures, inspect the Worker's safe scheduled-error message and the last update date.
See [Patreon's API documentation](https://docs.patreon.com/) for scopes and token renewal.
