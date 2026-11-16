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
and SHA-256 values in `config/operator-text-source.json`. Only explicitly superseded SHA-256 snapshots upgrade to the pinned record; unknown/newer
hydrated records win. This allows a checked correction to reach existing live data without
replacing a later content release.
Prebuild, predev and pretest perform this step. `completeOperatorText` backfills old
published operator page/API payloads server-side; newer exports carry
`operatorTextVersion: 5` and remain authoritative. Only relevant definitions travel
to the browser, never the entire translation dictionary. Website presentation types
live in `operatorTextTypes.ts`, separate from the shared game importer schema.

On Workers, the compatibility supplement is served through the existing shipped-table ASSETS reader, outside the cold-start code bundle. Local development and source compilation retain their direct record reads. Failed table reads can retry; successful reads are reused within the isolate.

`base-skill-glossary.json` joins canonical English labels and group definitions by the game’s term IDs and buff IDs. Alias normalization only applies to buffs that actually reference the term. Monster Hunter Party (`cc.tag.mh`) and Bubble Kingdom Hunting Squad (`cc.tag.mh2`) are distinct groups. All matching pages, Base views and compact previews share their respective keyword definitions.

Per-string `credits` overrides keep wiki adaptations separate from independent overview translations. Section/module credits link to immutable Arknights Terra Wiki revisions with CC BY-SA 4.0 attribution. The coverage guard audits every CN operator and every skill, talent, potential, module and Base skill variant; archive prose and voice transcripts are excluded. Numeric values are compared by value so 3 and 3.0 are equivalent. Version 5 backfills versions 1–4 with the current supplement.

`legacyStrings` contains exact older English fan sentences whose wording was corrected. These aliases apply only to CN records; Global modules continue to accept only the original CN-source replacements. Version 5 re-enriches prior version 4 payloads so corrected English can reach older published pages as well as fresh source compilation.
