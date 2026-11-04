# Krooster profiles

Public Krooster lookup profiles (https://www.krooster.com/network/lookup/<user>), fetched 2026-11-04 with a browser
User-Agent, reduced to the `roster` and the `account` fields the importer reads (`lib/account-import/krooster.ts`,
`profileFromData`): username, display name, server, level, assistant and the private flag. Friend codes and
other contact fields are not kept. `astesia_silverash` and `nnthelego05` returned no profile (private or gone).

    npx tsx scripts/bench/krooster-profiles.ts tests/fixtures/krooster/aiki.json 60 12
    npx tsx scripts/bench/compare-optimizer.ts <pre-table checkout>
