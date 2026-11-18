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
names and profile privacy. Only active paid members with unmasked identities and no
explicit pledge-privacy opt-out are acknowledged, once under their highest entitled
tier. Patreon's nullable `hide_pledges` field accepts `false` or `null`; `true`
excludes the member. Missing privacy fields fail the refresh, and unexpected values
remain excluded. Hidden or masked identities
are omitted; emails, addresses and payment histories are never published. The public
API accepts only the closed names/tiers/update-time projection.

The additive `0019_patreon_supporters.sql` migration stores the public snapshot and
encrypted rotating tokens in a dedicated private D1 table, independent of Arkpedia
accounts. The configured integration can initialize its integration tables idempotently;
it never alters existing account tables or runs unrelated pending migrations.
A database lease serializes token rotation. New tokens are persisted before
membership requests continue. A failed or incomplete refresh preserves the previous
snapshot and backs off for one hour; the displayed date makes its age visible.
The first snapshot retries after five minutes. Legacy initial one-hour cooldowns
are shortened without changing encrypted credentials; a cooldown returns 503
rather than reporting an indefinitely preparing snapshot.
Keep the latest private database state through code rollback so refreshed tokens
are not replaced with expired ones.

Check `/api/patreon-supporters`: 200 means a validated snapshot, 202 means initial
preparation, 204 means not configured and 503 means storage/validation unavailable.
The public route never returns provider responses or credentials. The additive
`0020_patreon_sync_diagnostics.sql` table records only a fixed failure code and
failure/recovery timestamps. Inspect this private health record or the Worker's
safe error code to distinguish provider HTTP errors, incomplete data and network
failures. Raw responses and credentials are never recorded in diagnostics.

`patreon_sync_audit` stores the latest complete provider read's timestamp and fixed
aggregate counts: membership pages, members read, inactive memberships, masked
member names, hidden pledges, unexpected privacy values, masked user names,
members without a paid entitled tier, eligible memberships, duplicate display
names and published names. Exclusion reasons are counted in filter order, once
per excluded membership. Eligible memberships equal published names plus duplicate
names. No member identities, emails or provider bodies are stored in this audit,
and it is never returned by the public endpoint. Failed/incomplete provider reads
retain the prior audit. This adds one small private D1 write to the existing daily
refresh and no provider requests or public-visit refreshes. The additive `0024`
migration matches the integration's idempotent initialization. A deployment does
not backfill these counts; they become available after the next scheduled refresh.
See [Patreon's API documentation](https://docs.patreon.com/) for scopes and token renewal.
