# Operator game text

Combat descriptions use `CombatText` inside the operator's `CombatKeywords` provider.
The server attaches only definitions referenced by that operator's mechanics. The page,
planner/reference previews and native selector previews retain those definitions.
`BaseSkillText` supplies the shared underlined keyword interaction: hover, focus or tap,
Escape/outside dismissal and a tooltip portalled into the nearest native dialog when
necessary. Base skills keep their own game-provided keyword lists.

`data/combat-keywords.json` is generated from the game’s Global constants with
`scripts/lib/combat-keywords.mjs`. Elemental definitions distinguish enemy targets from allies.
Whole-word matches and explicit inflections avoid interpreting ordinary substrings as
status effects. Only the first mention of a term in a description becomes a button.

`data/operator-translations.json` is an exact-source CN mechanics and game-overview supplement. It lives
in arkpedia-data, alongside the combat keyword record, and must be hydrated before
compiling the companion content release. Missing supplements preserve compatibility
with older snapshots. The overlay does not modify the source operator records. Official
Global traits, skills, talents and base skills bypass it; CN-only module text may still
receive an exact translation. Changed CN source text requires a reviewed new entry.

Keep translator credits visible next to the affected sections and in previews. Label
unofficial text explicitly, include its CN source, and identify AI assistance when used.
Do not invent an author for existing uncredited translations. Translating a label must
retain the original skill/base-skill artwork path; consumers prefer the supplied icon.
The game overview (`review.official`) is included; archive files and editorial writing are excluded. Credits are tracked per section. Attribution inspects the displayed text and explicitly reports incomplete English when Chinese remains, including changed source text without a matching replacement.


The deployment seeds missing supplements from the immutable arkpedia-data revision
and SHA-256 values in `config/operator-text-source.json`. Existing hydrated records
win, so a newer content release does not get replaced by an older bundled snapshot.
Prebuild, predev and pretest perform this step. `completeOperatorText` backfills old
published operator page/API payloads server-side; newer exports carry
`operatorTextVersion: 2` and remain authoritative. Only relevant definitions travel
to the browser, never the entire translation dictionary. Website presentation types
live in `operatorTextTypes.ts`, separate from the shared game importer schema.
