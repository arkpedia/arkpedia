# Pull or Skip poll

Review route: `/polls/pull-or-skip`. Keep this feature on the isolated native
Preview until the maintainer accepts the design; do not merge or promote it as
part of the first preview request.

Compact choices apply to every featured operator on a banner: Pull wants one
copy, Maybe means Good to have, and Skip means Not want. Detailed view retains
individual choices of Not want, Good to have, or potential 1–6. An unanswered
operator is distinct from Not want. Switching views never rewrites choices.
The catalogue reuses published Pull Planner windows and simulator rosters,
including featured four- and five-stars, with clearly labelled estimated dates.

Drafts save in browser storage. A share link puts choices in its URL fragment,
without publishing or submitting a ballot. Importing a local or exported Arkpedia
Pull Planner plan updates matching banners only and leaves the planner unchanged.

Submission is explicit. Anonymous entries use a secure, HttpOnly, browser-specific
cookie. Updates check the last submitted revision. The optional account prompt
uses the existing Google/Discord sign-in and account onboarding; sign-in alone
does not submit a ballot. Explicit submission with an account replaces this
browser’s anonymous entry. Clearing the cookie loses access to that anonymous
entry. Account deletion cascades account ballots. Rate limits and same-origin
checks use the existing community ingress protections plus a guest write limit.

Migration `0021_pull_poll.sql` is additive and uses only the selected deployment’s
accounts database. Native Preview publication applies it to the isolated Preview
database through the existing recovery and migration workflow.

Validation: `scripts/tests/test-pull-poll.ts` covers the model and real SQLite
submission/revision behavior. `tests/browser/pull-poll.spec.ts` covers compact and
detailed choices, reloads, draft sharing, anonymous submission and the optional
account prompt, and planner imports on desktop/mobile in dark/light themes.
