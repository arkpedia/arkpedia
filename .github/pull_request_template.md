## Change

Describe the reader's problem and resulting behavior.

## Validation

List checks actually run, their result, and any remaining limitation. Link visual
evidence for UI changes. A check not run is not a pass.

## UX review

For UI changes, follow [the UX review checklist](https://github.com/arkpedia/arkpedia/blob/dev/docs/development/ux-review.md).
Mark individual items N/A with a reason when they do not apply. For a change with
no rendered UI impact, replace this section with “N/A — no rendered UI change.”

- [ ] Complete journey, including browse → detail → browser Back and page Back.
- [ ] Populated, selected, switched-view and scrolled states; loading/empty/error where applicable.
- [ ] Desktop/mobile and dark/light; keyboard focus and controls checked.
- [ ] Stable controls and sticky behavior; no hidden-view actions or layout jumps.
- [ ] Shared patterns reused; design/architecture documentation updated where behavior changed.

## Release scope

Name the target branch and any data/schema, asset or hosting dependency. Normal
features target dev; Cloudflare-only changes target cloudflare. Production releases
use a disposable release branch, never dev as the PR head.
