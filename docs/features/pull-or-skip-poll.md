# Pull or Skip poll

Review `/polls/pull-or-skip` and `/polls` on isolated native Preview. Keep this PR
unmerged until the maintainer accepts the design. Results default to Simple: banner artwork, the community verdict and answer count.
Detailed results reveal the full breakdown. Voting keeps the supplied `pull-or-skip-mockup.html` as its visual reference: artwork-led banner rows,
rarity-striped operator portraits, per-banner expanders, joined potential buttons,
stamped verdicts and share/submit actions. The Leviathan stamp rotates around its lower-left corner so the frame stays inside the artwork. Banner-type labels are omitted in all
views. The polls overview uses plain banner art and the skin poll’s shared facts row.

Only debut banners, limited banners and event reruns enter the poll. Recurring Standard Pools, Kernel/Locating, Joint Operation and Orienteering banners are excluded. Newly recorded eligible banners join automatically. Exact close instants remove banners from voting and results; old drafts discard retired banner entries.

Pull targets one copy of each newly released operator, leaves older rate-ups at Nice to have, and sets off-banner returning limiteds to Don’t Want. Event reruns target their featured operators. One wanted six-star copy remains Pull even if the five-stars are unwanted. Five-star P1–P5 does not raise the stamp; P6 becomes Dolphin. Maybe means Good to have; Skip
means Not want. Individual choices are Don’t Want, Nice to have and P1–P6 with their game icons. Selecting
the current choice again clears it. A partly answered or customized banner is
Picky, except that a mix of Maybe and Don’t Want remains Tempted when no copies are planned; higher copy goals receive the mockup’s Dolphin, Whale or Leviathan stamps.
Banners with an unconfirmed roster accept a banner choice without inventing
operator goals. The catalogue reuses published planner windows and simulator
rosters, with estimates labelled.

Drafts stay in browser storage. Copy poll link copies the plain poll URL, without choices, query parameters or fragments. Existing shared-draft URLs remain readable. PNG/clipboard export renders one complete 1200px-wide bitmap shown
in the fitted preview. The reference-style sheet places each banner on the left and Pull/Maybe/Skip on the right. Detailed adds larger operator portraits and additional-copy labels such as `1× Orchid`, subtracting owned copies from the target potential. Planned acquisitions and Maybe operators appear; current ownership and final P1–P6 targets are omitted from the image. Maybe portraits use name-only amber labels. Skipped banner art is desaturated and faded only in stamped export styles; regular X rows keep the artwork in full colour; X and ~ use larger optically centered glyphs. Detailed exports omit per-banner PULL/X/~ headings. An optional header legend maps turquoise to Pull, yellow to Maybe and red to Skip, and is on by default. Empty skipped rows use a small red square instead of a heading. Detailed exports can hide off-banner limited operators or add stamps on the banner art. These switches change only the exported presentation and preserve all ballot choices. Row heights fit each banner’s artwork and operator content, with only a small inset. Simple and Detailed share a fixed 1200px sheet and 600px banner column, reserving three operator slots across. Simple also offers an art-only sheet with the existing Pulling/Tempted/Dolphin/Whale/Leviathan stamps; stamp paint is read from the shared CSS and kept inside each banner. The enlarged title and Arkpedia URL identify the source; the footer says Arkpedia without a region. Simple omits the choice legend; Detailed offers the optional compact header legend. Simple verdicts use centered PULL, ~ and X; operator labels are centered beneath their portraits. Artwork is enlarged, and the fitted preview has matching gaps above and below the image. Longer plans grow taller to include every answered banner
in the same image; no pagination or silently omitted banners. Failed artwork retains the names and choices.

Importing a browser or exported Pull Planner plan remains a one-time import.
Optional **Yes, sync** links acquisition goals in both directions on this browser,
preserving the planner’s resources, budgets and unrelated goals. Maybe has no
planner equivalent and stays local to the poll. Stop syncing disconnects later
changes. Shared links never silently enable planner sync.

Submission stays explicit. A small Successfully submitted dialog confirms a successful server response for anonymous and account entries; failures never show the success dialog. Signed-out voters first choose Google/Discord login or confirm anonymous submission; signed-in voters submit directly. The login choice preserves the selected draft in a tab-bound, expiring intent. After sign-in and any required account setup, that specific draft submits once as the account. Cancellation, failed sign-in and ordinary login do not authorize submission. Anonymous entries use a secure HttpOnly browser cookie; updates check the submitted revision. Account submission replaces this browser’s anonymous entry. Account deletion
cascades account ballots. Existing same-origin/ingress protections and guest write
limits apply. Conflicts refresh in place without reloading the application.

Results contain aggregates only. A banner with any wanted operator counts as Pull;
otherwise Good to have counts as Maybe, and remaining answers count as Skip.
Percentages use answers for each banner/operator, not fabricated sample totals.
Potential averages include positive copy goals only. Visible results refresh every
30 seconds and on focus. Empty and unavailable results are labelled.

Migration `0021_pull_poll.sql` is additive and uses the deployment’s accounts DB.
Native Preview’s existing recovery/migration workflow applies it only to isolated
Preview. Worker fallbacks read shipped static catalogues, preserving bundle limits.
The two illustrations in `config/pull-poll-art.json` use the reference mockup’s
immutable asset pins while their live catalogue artwork is pending.

Imported browser rosters and accepted cloud restores supply owned potentials locally.
Owned appears below portraits; the current potential is yellow until a higher target
is planned, when the planned potential is teal. Positive targets at or below the owned
potential are disabled; P6 owners can still choose Don’t Want or Nice to have. Planner
sync converts between target potentials and additional copies without changing the roster.

Detailed Results “You” badges use the same stamp classification and shared colours as the plan tags: Pull green, Maybe yellow, Skip red, with the matching higher-copy tier colours. Detailed result operator bars use Pull/Maybe/Skip segments. Each operator opens an
artwork-and-pie-chart dialog with aggregate P1–P6 slices and independent Skip/Maybe
filters. Counts come directly from ballot JSON aggregates; no voter identity is exposed
and no database migration is needed.
