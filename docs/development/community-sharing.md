# Community sharing

Community statistics and support listings are Preview-only while accounts remain Preview-only.
Apply migrations `0008_community_sharing.sql` through `0010_support_skill_ranks.sql` only to the isolated Preview account database when preparing
an approved account-enabled Preview. The API requires both `ACCOUNT_TRAFFIC_LIMIT` and
`ACCOUNT_IP_LIMIT`; missing bindings fail closed. Production account enablement is a separate release. The front router must preserve Preview
login cookies on the exact `/api/community/sharing` and `/api/community/availability` paths.
Public support/statistics routes still discard credentials; the application deployment alone
does not publish that front-router configuration.

Account settings → Community has three initially off, server-owned choices: statistics,
friend-tag sharing, and accepting support requests. Private cloud-save consent does not imply
any of these. New imports refresh an existing opt-in; changing game identity requires review.
Revision and mutation checks prevent older tabs from replacing consent. Withdrawal works without
a local game import and leaves a minimal tombstone so an in-flight publication cannot restore it.

Statistics project only ownership, builds and outfit state. They use each opted-in game account’s latest import, regardless of age. Statistics appear
once a server has 10 contributors; owner, E2 and equipped-outfit groups
have no additional minimum. Module percentages use all E2 owners, including low or unknown character levels.
Module levels are exact, mutually exclusive counts: a Level 3 module counts only toward Level 3. Zero counts in nonempty groups display as 0%; empty or
unknown groups remain unavailable rather than representing 0/0 as a percentage. Canonical roster masteries include the next mastery in training,
as requested; the support finder instead uses the actual selected support skill's completed mastery.
The server stores a keyed fingerprint of server/UID to deduplicate game accounts, not the raw UID.

Support cards reuse the friend-import card and support tiles, returning all equipped supports
when any of them matches the filters. Selecting a row opens all three equipped support builds,
with S1, S2 and S3 vertically beside each portrait (fewer for operators with fewer skills). Selecting
a portrait or skill opens the existing full operator dialog. Each skill shows the imported completed
mastery and shared skill rank; the currently equipped skill is highlighted. Older imports leave
missing ranks unknown, and full details explicitly label maximum reference values when the actual
build is incomplete. Public fields are the imported friend tag, avatar, banner, account level, collection counts, server, equipped
supports and their builds/outfits, open-slot count and import date. Known positive capacity and an
import no older than seven days are required. A manual import makes one optional friend-list
count request; a failed count remains unknown and never fails the game import. No friend IDs from
that response are retained and no background game-server polling is added.

Members may report Full or Has room, or remove their observation. One observation per reporter
and listed player counts for 24 hours, across all three supports. Three Full reports outnumbering
Has room reports temporarily hide a listing. A new import or withdrawal clears its observations;
account deletion cascades both reports made and reports received. These are advisory snapshots,
not proof of ownership or a reservation of a friend slot.

The integrated auto-deploy importer preserves its replay session and advances its sequence
past the optional friend-count request (`seqnum: 3`). Its first replay uses 4 when that request
was sent, including an uncertain failure. The import regression tests cover this boundary;
never reset or reuse a consumed sequence.

Public reads disable caching so withdrawal is reflected on the next request. Expiry excludes data
from results; stored snapshots remain until replacement, withdrawal or account deletion. Explain
this separately from private cloud saves in the privacy notice and help. Reporter identities and
full individual statistics snapshots are never returned in public responses.
