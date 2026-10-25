# Versioned account preferences

`lib/settings/siteSettings.ts` validates the versioned `arkpedia:settings` storage
contract. The accepted Cloudflare pilot can save `techniqueDetail`; main preserves
that value through backup/sync without promoting the deferred Techniques interface.
Unknown or invalid values are discarded and defaults remain implicit until chosen.

`parseSettings` is the cloud-data boundary. The store also supplies `getSetting`,
`setSetting`, `exportSettings`, `importSettings` and `createSettingsStore` for tested
storage behavior. Refused storage retains a change in memory for the current visit.
There is no exported React hook until a reviewed main feature needs one.

Theme, site server and music preferences retain their existing keys and validation.
Do not migrate their storage as part of adding an unrelated setting: theme/server
are read before React and music restore must preserve its playing engine.

When a value changes meaning, bump `SETTINGS_VERSION` and implement migration with
compatibility tests in `scripts/tests/test-site-settings.ts`. Never drop a pilot
setting merely because main does not yet expose its control.
