# UX review before merging

Review the changed reader journey, not just the first screen. Use the
[design system](design-system.md) and [shared primitives](ui-primitives.md).
Record what was checked in the PR, with screenshots or browser evidence where useful.
N/A is valid with a reason; unchecked behavior is not verified behavior.

## Choose the affected journey

Follow a realistic path through the changed feature using populated records. Include
an item far enough down a catalogue to require scrolling or progressive loading.
Open its detail page, return with browser Back, and repeat with the page's Back link.
Confirm filters, selected view, search and scroll position return together. Follow
an ordinary link to another page and confirm it starts at the expected destination.

## Review states and hierarchy

- Active and inactive controls must be distinguishable. Check after changing the
  selection, not only on load. Counts are secondary to labels.
- Switch every affected view. Its controls belong with its content; a hidden view's
  controls must leave both the screen and keyboard order.
- Keep selectors in a stable position as labels, counts and results change. Test
  short and long labels, wrapping, zero results and a fully populated list.
- Check loading, empty and recoverable-error states where the change affects them.
  Never use real account credentials or account records as test evidence.
- Reuse the established directory, list, table or workspace pattern for the task.
  Buttons should name the result in reader language.

## Check responsive and accessible behavior

Use desktop and narrow mobile widths in both dark and light themes. Check a scrolled
state as well as the top. For sticky controls also check a short viewport, focused
controls, open menus and dialogs: the toolbar must not cover content or trap focus.
Tab through the changed controls and activate them with the keyboard. Check visible
focus, labels, selected semantics, contrast, overflow and reduced-motion behavior
where relevant.

## Evidence and automation

Run the relevant existing browser specs and inspect the rendered result. Use
representative homepage, schedule, story, operator-detail and base-planner journeys
when a shared primitive changes. Add a regression only when it protects meaningful
behavior; do not generate broad screenshot baselines merely to make a check green.

A full visual regression suite is a separate follow-up. This checklist makes no
claim that screenshots or human judgment are automatically verified by CI.

Before calling a release complete, use [Release status](release-status.md), and do
the affected browser journey on the deployed site. A successful HTTP probe alone
does not verify layout, hydration, interaction or browser Back.
