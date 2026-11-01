# Versioned account preferences

`lib/settings/siteSettings.ts` validates the versioned `arkpedia:settings` storage
contract. The accepted Cloudflare pilot can save `techniqueDetail`; main preserves
that value through backup/sync without promoting the deferred Techniques interface.
Unknown or invalid values are discarded and defaults remain implicit until chosen.

`parseSettings` is the cloud-data boundary. The store also supplies `getSetting`,
`setSetting`, `exportSettings`, `importSettings` and `createSettingsStore` for tested
storage behavior. Refused storage retains a change in memory for the current visit.
Preview audio controls use `useSiteSetting`; it preserves the same validated store contract.

Theme, site server and music preferences retain their existing keys and validation.
Do not migrate their storage as part of adding an unrelated setting: theme/server
are read before React and music restore must preserve its playing engine.

When a value changes meaning, bump `SETTINGS_VERSION` and implement migration with
compatibility tests in `scripts/tests/test-site-settings.ts`. Never drop a pilot
setting merely because main does not yet expose its control.

## Preview audio preferences

Preview adds `backgroundMusic` (false), `greeting` (`off`, `random`, `owned`, or
`chosen`) and `greetingOperator` (an operator name). `useSiteSetting` subscribes to
this store, including same-tab changes and cloud restores. These preferences use
personal-save consent; they do not change analytics or external-media consent.

Background playback belongs to the page that requested it. The mini player uses
reviewed lobby associations projected into the event page's `page-music` release
table. Calendar tags and reruns resolve to the original event. Unknown events stay
silent. The homepage uses the default Vision theme, m_sys_void / 生命流 (MSR 232202),
identified by the [interface BGM reference](https://arknights.wiki.gg/wiki/Soundtrack/BGM/Interface).

Page music loops by itself at no more than 15% of the player volume scale, without
changing the stored volume, queue, shuffle or repeat settings. Leaving, disabling
background music, or cancelling a pending page request stops it. Explicit player
controls take ownership; a manual pause suppresses further page autoplay until the
tab closes. A page-owned track is not written as a resume request for another page.
A browser refusal offers Play; it never opens the external-media prompt by itself.
Phones that ignore element volume still use their hardware volume.

A greeting is a current recorded `Title` line from the operator's published voice
page, resolved to that release's pinned asset. Japanese is preferred, then English,
Chinese and Korean. Random-owned reads only the imported account's operators, not
planner goals. No game-server request or credential is involved. One greeting is
offered per tab visit; navigating away, disabling it, or choosing music cancels it.
Blocked playback has an explicit Play button. Missing recordings remain silent.

Verification: `test-page-audio.ts`, `test-site-settings.ts`, `page-audio.spec.ts`,
plus the existing music resume, data-saver and playback-truth browser checks.
