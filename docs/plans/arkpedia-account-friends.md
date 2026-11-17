# Friends discovery and future account requests

The Friends tab at `/account?panel=friends` retains manual import/export. Imported files are snapshots stored separately from the viewer's own account; updating one requires another export/import.

## Discovery and public profile links

The November 17 implementation is for checked-source Preview review. Production promotion needs maintainer approval and account migration `0022_public_friend_profiles.sql`; Preview applies it only to `arkpedia-preview-accounts` after its recovery bookmark is verified.

Find Friends searches recent players who enabled “Share my friend tag and support units,” have open friend slots, and meet the existing support listing and availability-report rules. Operator searches use their equipped supports, plus owned operators from collections they explicitly published. Anonymous statistics never supply an identified roster.

Add friend saves a stable profile reference in this browser. It does not send an Arkpedia or in-game friend request. Shared references are rechecked on opening, every 30 seconds while visible, and on tab return. Withdrawn or expired profiles become unavailable. Full collections are fetched only while viewing them; saved references contain no cached roster. Manual files and shared references have a combined limit of 50 friends.

Copy Profile Link requires login and a separate “Make this collection public” confirmation. Publication shares owned operators, recorded builds, skins, profile appearance and equipped supports; it also enables the disclosed friend-tag/support listing choice. It excludes game UID, biography, registration date, resources, pull history, credentials, stage progress, medals and unowned planner goals. Existing anonymous-statistics or support consent does not authorize a full collection. The link shows the snapshot explicitly published; publish again after importing to update it.

Account settings exposes Public profile link so owners can stop full-profile sharing independently of support sharing. Turning support sharing off or changing the imported game identity also withdraws the collection and its operator search index. Revision checks and atomic mutations prevent stale publication from undoing withdrawal or overwriting a newer account's data. Previously exported manual files cannot be recalled.

Shared views reuse FriendCard, ProfileCard, FriendCollection and recorded support builds. A friend's preview never substitutes the viewer's planner goals or builds. Imported builds and availability are self-reported, not verified in-game state.

## Future mutual account requests

The earlier November 5 request for account-to-account friend requests remains separate. That future flow would send requests from support search, show pending requests above accepted friends, and persist relationships through Arkpedia accounts. Discovery and public profile references do not implement mutual requests. Do not show a requests section until that feature exists.
