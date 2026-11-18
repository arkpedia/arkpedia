# Following and independent public profile links

The account tab is **Following** (`/account?panel=following`). Old `/friends` bookmarks and `panel=friends` still open it. Existing exported-file formats, browser storage keys and public profile URLs stay compatible. Following is one-way and stores profile IDs in the viewer's browser; it creates no server relationship, request, acceptance or notification.

## Consent

Account settings → Saving & sharing contains four independent checkboxes:

- Contribute to community stats: anonymous aggregate contribution.
- Share my friend tag and support units: the existing support finder, including its freshness, slots and availability rules.
- Allow following: discoverable basic profiles and locally saved followed references. No dependency on support sharing, import age or in-game friend slots.
- Direct profile link: explicit publication of Profile Card, owned operators, recorded builds and owned skins. Save community choices to enable/update it or disable the URL. Copy link appears for an enabled link. Following and support searchability are not enabled by this choice.

A full collection is visible through its direct URL while Direct profile link is enabled. Following can show that same published collection, or just the basic profile when full publication is off. Turning off Following removes discovery and followed access without invalidating an independently enabled direct link. Turning off Direct profile link invalidates the direct URL and clears the full collection and operator index, while leaving basic following and supports controlled by their own choices. An imported game-identity change or Stop all sharing withdraws publication. Previously exported files cannot be recalled.

Public projections exclude game UID, biography, resources, pull history, registration date, credentials, stage progress, medals and unowned planner goals. Support builds and slots are omitted from following views when support sharing is off. Revisions and conditional atomic writes prevent stale requests from resurrecting consent or replacing a newer account's collection.

## Migration and release

`0023_allow_following.sql` adds independent flags and changes the publication-withdrawal trigger. Only existing explicitly published profiles retain following and direct-link consent; support-only users default to off. Apply and verify this additive migration against Preview with a recovery bookmark before publishing code there, and separately against production before production promotion. Never copy databases between environments or restore old account data for a code rollback.

## Cost boundaries

Follow/Unfollow remains local. Directory pages are bounded to 50 results and saved-reference revalidation batches at most 50 IDs. Public discovery and summary checks each execute one bounded read, skip session authentication and never scan support-availability reports. Full collections are fetched only while open; visible views recheck small summaries every 30 seconds and on focus, without downloading unchanged snapshots or running background jobs. Full snapshots are bounded to 500 KB. Unrelated settings saves do not republish them, and republishing updates only added/removed operator-index rows. Consent writes retain existing rate and revision limits. Preserve immediate withdrawal checks instead of caching private consent responses.

## Future mutual friends

Sending and accepting friend requests would be a separate account-backed Friends feature. Do not imply a mutual relationship or display request controls in Following.
