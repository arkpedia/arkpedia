# UI primitives and tokens

This is the reference for building or migrating any Arkpedia page. It covers the design tokens, the shared components in `components/ui`, the global rules, and the style audit and page-bounds checks that hold every page to them. Follow it literally. When a page needs something this page does not cover, add it here and to the primitives. Do not solve it inside the page.

The canonical style is the `/operators` list page plus `/gacha`, as decided on 2026-09-25:

- Section headings are `.op-section h2` in `--heading`, a teal-ish colour kept apart from the `--teal` that marks on/current states (maintainer, 2026-09-26; amber was tried and rejected).
- Picture and content cards (posters, banner art and thumbnails, operator and skin tiles, album covers, portraits, the /games and /community cards) carry **no resting border**: the art says they can be clicked. They draw a teal edge on hover and keyboard focus. Only real controls (buttons, chips, inputs, tabs, dropdowns) carry `--control-border` at rest.
- Buttons are Rajdhani, uppercase, with 0.09em tracking.
- The page header has a mono teal eyebrow above a 30px Rajdhani h1.
- Everything sits in a 1040px frame with 24px gutters.
- Radii come from the 2–4px family.
- The operator detail page (`OperatorPage.module.css`) is being brought in line with this style. It is not a second reference. The one thing taken from it is `StyledSelect`.

## Where things live

| What | Where |
|---|---|
| Every token (colour, radius, frame, fonts) | `styles/core/shared.css`. Dark values are in `:root` and light values in `:root[data-theme="light"]`. Tokens are never defined anywhere else. |
| Primitive rules: buttons, chips, inputs, tabs, rarity classes, panels | `styles/core/arkpedia-theme.css` |
| The global element rules: header, h1–h3, main, scrollbars, focus ring | `styles/core/shared.css` |
| The nav frame | `styles/core/nav.css` |
| React primitives | `components/ui/*` |
| Loaded webfont weights | `pages/_document.tsx` (Google Fonts URL) |

The global stylesheets load before every feature stylesheet (`pages/_app.tsx`). At equal specificity a feature rule therefore beats a primitive. That is how pages have been overriding the primitives, and migrating a page mostly means deleting those overrides.

CSS modules are used by the operator page, the games, the pulls workspace and `StyledSelect`. A module may style its own layout. It must not restate a primitive's paint: colours, borders, radii, button voice or heading sizes.

## The rules

1. **Teal means "on" or "current", and nothing else.** Selected chips, the current tab, the active nav item, a focused control and hover all use teal. Headings, resting links, decoration, rarity and categories must not be teal. "On" has one look everywhere: the `--teal-dim` fill with teal border and text (`.filter-chip[aria-pressed="true"]`, `.tgl.is-on`, `.pick-card` when picked). The solid `--teal-fill` is `.primary`'s and never marks a state; `tests/browser/on-states.spec.ts` fails when a pressed, checked or `.is-on` control computes that fill.
   - **One deliberate exception:** the automatic skill metric ("SP recovery: Auto", "Activation: Auto") is teal-bordered on `--teal-dim` on the operator page (`.skillMetricAuto` in `OperatorPage.module.css`) and in the `/gacha` operator preview (`.gacha-preview-skill-fact.auto` in `gacha.css`). The maintainer chose this in main's 2026-09-25 commit "Align gacha rarity borders and skill recovery colors", and it stays. Two older teal surfaces also stay, each with its own meaning: `.enemy-resist.vulnerable` on `/enemies` (a weakness, not a state) and the `/gacha` X1 button (the reference page, left as it is). Those are the only non-state teal surfaces. `audit:styles` (`tealDecoration`, strict) rejects teal on a selector that names no state in the page families already clean of it, today `styles/stages/`; elsewhere reviewing new ones is left to people, so keep this list in step with the code and add a family's folder to `TEAL_DECORATION_SCOPE` in `scripts/audits/audit-styles.mjs` once it is clean.
2. **One resting boundary for controls.** Anything that can be pressed, typed in or picked from has a `--control-border` border at rest. `--line` and `--line-soft` are for passive hairlines only (panels, dividers, table rules).
3. **One hover rule.** On hover, the border and the text go to `--teal`. Destructive `.danger` controls are the exception: they stay red.
4. **Rarity colour comes only from `--rarity-N`**, through `<Rarity>`, `.rarity-N`, `.tier-N` or `.tier-fill-N`. 5★ is never teal.
5. **One frame.** The header, `main` and the nav share `--frame-max` (1040px) and `--page-gutter` (24px at every width). There are no per-feature gutters and no `main-wide`.
6. **One page header**, `<PageHeader>`, placed as a sibling of `<main>`.
7. **One dropdown**, `<StyledSelect>`. Never write a native `<select>` or a hand-built `role="listbox"` outside `components/ui`.
8. **Radii come from tokens**: `var(--radius)` (2px) by default, `var(--radius-frame)` (3px) for an outer frame or a floating menu, and `var(--radius-control)` (4px) at most for a tile-like control. Never use a literal, and never 999px pills.
9. **Only loaded font weights.** Rajdhani 500/600/700, JetBrains Mono 400–700 and Inter 400–700 are loaded. Any other weight is faked by the browser as faux bold.
10. **Anti-Page Jump.** No state change may leave the document shorter than the reader's scroll position needs. See the `arkpedia-ui` skill. `components/ui/useHeightFloor` is the general-purpose fix.

## Tokens

All values are in `styles/core/shared.css`. `scripts/tests/test-ui-tokens.ts` checks the contrast each token promises (in `npm test`), so a token edit that breaks legibility fails CI.

### Surfaces and text

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | #0f151b | #F1F3F5 | Page ground. Also the `theme-color` meta (`lib/nav/themeColor.ts`). |
| `--panel` / `--panel-2` | #18212a / #1b242d | #FBFCFD / #E7ECEF | Panels, and the surface one step up |
| `--well` | #111820 | #DEE4E8 | Inset fields (inputs), meter tracks |
| `--panel-dim` | #141c23 | #E9EEF1 | An inert control's ground |
| `--panel-grad`, `--row-grad`, `--row-grad-hi` | gradients | gradients | Panel, button and selected-row surfaces |
| `--text` / `--text-dim` / `--text-faint` / `--text-bright` | | | Body, secondary, micro-labels (at the AA floor), emphasis |

### Lines and controls

| Token | Dark | Light | Use |
|---|---|---|---|
| `--line` / `--line-soft` | white .10 / .06 | black .12 / .07 | Passive hairlines only |
| `--control-border` | white .38 | #727f89 | The resting border of every control. At least 3:1 on every surface. |

### Accent and state

| Token | Dark | Light | Use |
|---|---|---|---|
| `--teal` | #5fd9c6 | #07695a | On or current: text, borders, focus ring |
| `--teal-dim` | teal .14 | teal .12 | The fill behind a selected item. Teal text on it clears 4.5:1 in both themes. |
| `--teal-fill` / `--teal-fill-hi` | gradients | #0a7f6c→#097565 / darker | **Primary actions only** (`.primary`), with `--teal-ink` text |
| `--teal-ink` | #0a2621 | #FFFFFF | Text on a teal fill |
| `--heading` | #67cbdd | #0b6879 | Section headings (`.op-section h2` and the page headings built like it) |
| `--amber` | #e0aa4e | #8F5808 | Countdowns, costs, warnings (never headings) |
| `--danger` / `--danger-dim` / `--danger-solid` | | | Destructive actions and errors. Use `-solid` behind white text. |

### Data colours

| Token | Use |
|---|---|
| `--rarity-1` … `--rarity-6` | Rarity as text or an edge. Light values clear 4.5:1 on `--panel-2`. |
| `--rarity-fill-1` … `--rarity-fill-6` | Rarity as a surface behind near-black ink (`.tier-fill-N`). Same values in both themes. |
| `--cat-blue`, `--cat-yellow`, `--cat-orange`, `--cat-green`, `--cat-red`, `--cat-grey` | Categories: /base facility kinds and /farming stage kinds. Tint a surface with `color-mix(in srgb, var(--cat-blue) 15%, transparent)`. |

### Shape and frame

| Token | Value | Use |
|---|---|---|
| `--radius` | 2px | Default for every control and surface |
| `--radius-frame` | 3px | An outermost frame, a modal, a floating menu |
| `--radius-control` | 4px | The ceiling: icon tiles, large action buttons, `.tgl`, `.chip` |
| `--frame-max` | 1040px | The page frame (nav, header, main) |
| `--page-gutter` | 24px | The frame's side padding at every width |
| `--font-display` / `--font-mono` / `--font-body` | Rajdhani / JetBrains Mono / Inter | Display and buttons / data and labels / prose |

## Global rules

These apply to every page with no opt-in:

- `:where(a[class]) { color: inherit }`. A classed anchor takes its colour from its own class or its parent, never the browser's link blue. It has zero specificity, so any class that sets a colour wins.
- `code, kbd, samp` use `--font-mono`.
- `:root { accent-color: var(--teal) }` applies to native checkboxes, radios and ranges.
- The theme's input rule is inside `:where()` and has zero specificity. A page class on an input always wins. Focus keeps the site's 2px teal outline. There is no `outline: none` and no halo.
- `input`, `select` and `textarea` use `font: inherit`, so there is no browser Arial.
- The scrollbar thumb rests at `--text-faint` everywhere (the `:root` default and the drawn `.sidescroll` bar). The drawn bar also turns teal on hover. `scrollbar-color` is inherited, so a nested vertical scroller sets at most `scrollbar-width` and takes the colour from `:root`. A thumb in `--line` or `--line-soft` (1.31:1) is rejected by `audit:styles` (`scrollbarThumb`).
- `.site-nav-trigger` is in sentence case at weight 400, like the nav links.

## Components (`components/ui`)

### PageHeader

The eyebrow, the h1 (30px, 24px at ≤720), an optional lede, optional actions, and the hairline. It renders the same markup as the reference pages.

```tsx
import PageHeader from '@/components/ui/PageHeader';

<>
  <PageHeader
    eyebrow="Rhodes Island // Personnel Archive"
    title="Operator roster"
    sub="Every operator on Global and CN."        // optional
    actions={<>{/* search, SegmentedControl, buttons */}</>}  // optional
  />
  <main>…</main>
</>
```

- `eyebrow` and `title` are required. Give each section its own eyebrow: seven pages sharing "Rhodes Island // Terminal" is a finding.
- `slim` reduces the vertical padding for a tool whose first screen is the tool (stage terminals, Stronghold, music). The title size stays the same.
- Render it **outside and before** `<main>`, never inside it. A header inside `main` starts 24px to the right of the content. The bounds test measures this.
- Do not restyle the h1 (size, case, colour). `audit:styles` rejects h1 size or case rules outside `shared.css`.

### SegmentedControl and `.filter-chip`

Use SegmentedControl to pick one of N: view modes, rarity, sort order, tabs that swap content in place.

```tsx
import SegmentedControl from '@/components/ui/SegmentedControl';

<SegmentedControl
  label="Rarity"
  value={rarity}
  onChange={setRarity}
  options={[
    { value: 'all', label: 'All' },
    { value: 6, label: '6★', ariaLabel: '6-star', count: 112 },
    { value: 5, label: '5★', ariaLabel: '5-star' },
  ]}
/>
```

- It renders a `role="group"` of `<button class="filter-chip" aria-pressed>`. Tests find each option with `getByRole('button', { name })`.
- The pinned chip is 32px tall (36px at ≤720), with a `--control-border` border, `var(--radius)` and the button voice (Rajdhani 600, 12px, uppercase, 0.09em). When picked it has a `--teal-dim` fill, teal text and a teal border.
- **Never** use `cond ? 'primary' : 'ghost'` for a pick-one control or a toggle. `--teal-fill` is reserved for primary actions. `audit:styles` rejects the swap in TSX (`primaryToggle`, strict; `pages/dev` excepted). A button whose label says its state ("Play" / "Pause") keeps one class and takes no `aria-pressed`.
- `.tgl` (the toolbar and settings switch, mono 11px) takes `.is-on` together with `aria-pressed`. On is the chip's picked state, not a fill.
- For filters that toggle independently (tags you can turn on together), render `.filter-chip` buttons directly with `aria-pressed`. The picked state reads `aria-pressed`, `aria-selected` or `aria-checked` (`.active` also works during migration).
- Chip content can include `icon` (an 18px img or svg), `count`, and `ariaLabel` for icon-only chips.

### Buttons

| Class | Use |
|---|---|
| *(none)* on `<button>`, or `.btn` on a link | Secondary action: `--row-grad` with a `--control-border` border |
| `.primary` | The one action that matters on the screen: teal fill with `--teal-ink` text |
| `.ghost` | Tertiary actions and dense toolbars: transparent with a `--control-border` border |
| `.danger` | Destructive actions (Reset, Start over, Delete): red border and text |
| `.btn-sm`, `.btn-lg` | Size modifiers |
| `.btn-bare` | A `<button>` that is **not** a button: a card, a tile, a list row, an album cover. The base button rules skip it entirely (no uppercase, no tracking, no weight, no inline-flex centring, no teal hover), so your own class supplies the look. |
| `.pick-card` | A selectable card (a preset, a banner). It has a `--control-border` frame and a teal hover. When picked (`aria-pressed`, `aria-selected`, `aria-checked` or `.is-selected`) it has a teal border over `--teal-dim`. Use it with `.btn-bare`. |

```tsx
<button type="button" className="btn-bare album-tile" onClick={open}>…</button>
<button type="button" className="btn-bare pick-card" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>…</button>
<button type="button" className="danger" onClick={reset}>Reset base</button>
```

Anchors: `<Link className="btn">`, `<Link className="btn primary">`, `className="ghost"` and `className="danger"` all take the button look.

### StyledSelect

This is the only dropdown. It replaces the native `<select>`, `gm-pickbtn`, `stage-picker-btn`, `PlannerSelect`, `cal-pick-btn` and `ContentPicker` (the enemy pages' picker, which is inside `components/ui` but is a duplicate to fold into this one).

```tsx
import StyledSelect from '@/components/ui/StyledSelect';

<StyledSelect
  label="Filter by faction"          // required accessible name
  value={faction}
  onChange={setFaction}
  placeholder="All factions"         // shown when value matches no option
  options={[
    { value: '', label: 'All factions' },
    { value: 'rhodes', label: 'Rhodes Island', group: 'Terra' },
    { value: 'kjerag', label: 'Kjerag', group: 'Terra', disabled: true },
  ]}
/>
```

The options are generic. Extend `SelectOption` with your own fields and draw them with the render slots:

```tsx
type AllianceOption = SelectOption & { icon: string; n: number };

<StyledSelect<AllianceOption>
  label="Alliance"
  value={alliance}
  onChange={setAlliance}
  options={alliances}
  renderOption={(o, { selected }) => <><img src={o.icon} alt="" width={20} height={20} /><span>{o.label}</span><span className="count">{o.n}</span></>}
  renderValue={(o) => <><img src={o.icon} alt="" width={18} height={18} />{o.label}</>}
/>
```

- `size="title"` is the heading-sized trigger (22px Rajdhani uppercase, no fill), used for the calendar's month and year.
- `align="end"` right-aligns a menu wider than its trigger. The default is `start`.
- `menuMinWidth` defaults to 240.
- `disabled` disables the control, and so does an empty options list.
- Groups: consecutive options with the same `group` are drawn under one heading, in order.
- Rows are at least 40px tall. The selected row has teal text on `--teal-dim` with a check mark.
- Keyboard: Enter, Space, the arrow keys or Alt+ArrowDown open the list. The arrow keys move, Home and End jump to the ends, PageUp and PageDown move ten rows, Enter, Space or Alt+ArrowUp choose, Escape and Tab close, and typing finds a row by its label (repeating a letter cycles through the matches). Disabled rows are skipped.
- The render slots are optional on purpose. They are presentation, and plain text rows are the right default. The house rule that new information must be a required prop applies to behaviour, not to slots.

### SearchInput and SuggestMenu

This is the only text search field. With `suggestions` it becomes a combobox with a list on StyledSelect's surface.

```tsx
import SearchInput from '@/components/ui/SearchInput';

// Plain filter box
<SearchInput label="Search operators" value={q} onChange={setQ} placeholder="Search by name…" />

// Autocomplete: every suggestion prop is required together
<SearchInput
  label="Guess an operator"
  value={q}
  onChange={setQ}
  suggestions={matches}
  getKey={(op) => op.name}
  renderSuggestion={(op) => <><img src={icon(op)} alt="" width={32} height={32} /><span>{op.name}</span></>}
  onPick={(op) => guess(op.name)}
  suggestLabel="Matching operators"
  emptyText="No operators found."    // optional
  upward                             // optional: open above, for a field low on a phone
/>
```

- Keys: ArrowUp and ArrowDown move the highlight while focus stays in the field. Enter picks the highlighted row, or the only row when exactly one matches. Escape closes the list, and a second Escape clears the field.
- The field is `.search-input` (`--well` ground, `--control-border`, mono 13px, 16px at ≤720 so iOS does not zoom) with a magnifier and a clear button.
- The list is absolutely positioned inside the field's wrapper, so it never adds to the page height.
- `SuggestMenu` is exported for the rare field that cannot be a `SearchInput`. Import it rather than drawing a list.

### ScrollRow

Use it for a row of cards that cannot wrap, such as the home skins row or the `/music/discover` rows.

```tsx
import ScrollRow from '@/components/ui/ScrollRow';

<ScrollRow label="Skins on sale">
  {skins.map((s) => <SkinCard key={s.id} skin={s} />)}
</ScrollRow>
```

- It renders a flex line (children never shrink, 12px gap) with `overflow-x: auto` and the drawn `.sidescroll` bar: 10px, space reserved, `--text-faint` thumb, teal on hover.
- When the content overflows, the row becomes a named, focusable region, so the keyboard can scroll it.
- `controls` adds a previous/next pair of ghost buttons under the row's right end, for a row that is a page's main content (the `/skins` "Available now" shelf): a wheel-only mouse and iOS, which shows no drawn bar, get a way along it. Each scrolls by most of the row's width and is disabled at its end; the pair keeps its space (hidden) while the row fits, so it never changes the page height.
- No auto-scroll or marquee. The home marquee becomes a ScrollRow.
- A small fixed set should wrap instead (`.no-scroll-wrap`).
- Any other horizontally scrolling box gets `class="sidescroll"` plus its own `overflow-x`.
- The Stronghold companion keeps `components/gamemodes/CompanionScrollRow`, a drawn JS rail, because iOS ignores `::-webkit-scrollbar` and the companion is used on phones.

### Rarity

```tsx
import Rarity, { rarityLevel } from '@/components/ui/Rarity';

<Rarity n={rarityLevel(op.rarity)} />                // "6★" in --rarity-6
<Rarity n={6} format="stars" />                      // "★★★★★★"
```

- For a portrait tile, add `className={`tier-${n}`}`, a 3px bottom edge in the rarity colour.
- For a full colour block, use `tier-fill-${n}`, the rarity surface behind near-black ink.
- For custom CSS, use `color-mix(in srgb, var(--rarity-5) 15%, transparent)` for a tint. Never a hex.
- `rarityLevel()` throws on a value outside 1–6, because that is a data error.

### useHeightFloor

This is the Anti-Page Jump fix for one container whose content can shrink: a tab switch, "show less", closing a panel.

```tsx
import { useHeightFloor } from '@/components/ui/useHeightFloor';

const floor = useHeightFloor(eventSlug);           // the logical page, not the tab
<div ref={floor.ref}>{tabContent}{floor.spacer}</div>
```

It reserves exactly what the reader's position needs and gives the space back as they scroll up. Verify each use with the `apj()` probe: `anchorMovedPx` must be below 4 at 1440 and 390. Do not use it for a search that narrows a long list (see the skill).

### Error pages

`pages/404.tsx` and `pages/500.tsx` use `PageHeader` in the site frame on `--bg` in both themes. They are static on purpose.

## The ratchets: what is left

Two checked-in baselines listed the offenders while the page families migrated. CI fails on a **new** offender and also on a **stale** one: a fixed case must be removed from its baseline so that it cannot come back. Since the families landed (2026-09-25) most lists are empty, and an empty one is **strict**: it takes no entry, and regenerating the baseline refuses to add one.

What still carries accepted cases, all in `scripts/audits/style-audit-baseline.json`:

- `nativeControls` (3): the Stronghold companion's two language pickers (`StrongholdCompanion.tsx`, `role="listbox"`; the companion runs in a Document Picture-in-Picture window and `StyledSelect` portals its menu to the main document) and the development-only `pages/dev/index.tsx` `<select>`.
- `collisions` (20) and `fontSizes` (21): scoped descendant rules the audit's heuristic flags, and deliberate sizes (16px iOS no-zoom inputs, the 88px tutorial emoji).

### 1. `scripts/audits/style-audit-baseline.json` (`npm run audit:styles`, a Check step)

| Key | What it lists | What to do |
|---|---|---|
| `nativeControls` | `<select>` and `role="listbox"` outside `components/ui`, per file | Replace with `StyledSelect` (or `SearchInput` for suggestion lists) |
| `rarityLiteral` (strict) | Colour literals in rarity, star and pull rules, and in any custom property named for rarity | Use `var(--rarity-N)`, `.rarity-N`, `.tier-N` or `.tier-fill-N` |
| `oldTeal` (strict) | `#4de8d1` / `rgb(77 232 209)` | Use `var(--teal)` (pass it through CSS, or `currentColor`) |
| `pills` (strict) | 999px radii | Use a radius token |
| `h1Rules` (strict) | h1 size or case rules outside `shared.css` | Delete them and render `PageHeader` |
| `fontWeights` (strict) | Rules asking a font for a weight it does not load | Load the weight in `_document`, or use a loaded one |
| `collisions` | A bare class styled in two global stylesheets | Scope the class to its page, or move a shared one to `core/` |
| `fontSizes` | Sizes off the scale (9–13 body; 15/18/22/26/30 display) | Round to the scale |
| `rawHex` (strict) | A hex literal that a token names | Use the token |
| `scrollbarThumb` (strict) | A scrollbar thumb in `--line` or `--line-soft`, as `scrollbar-color`'s first colour or a `::-webkit-scrollbar-thumb` background | Drop the override and inherit `:root`'s `--text-faint` |
| `primaryToggle` (strict) | A TSX class chosen between `'primary'` and `'ghost'` by a condition, outside `pages/dev` | A `.filter-chip` with `aria-pressed`, or one constant class when the label carries the state |
| `tealDecoration` (strict) | `var(--teal)`, `--teal-dim` or `--teal-fill` as a colour, background, border, outline or shadow on a selector with no state in it (`:hover`, `:focus`, `:checked`, `[aria-pressed]`, `[aria-current]`, `.current`, `.live`, `.open`...), in the folders of `TEAL_DECORATION_SCOPE` (`styles/stages/`) | Recolour it (`--text-dim`, `--heading` for a heading), or qualify the selector with the state it marks |

```sh
npm run audit:styles                 # check
npm run audit:styles -- --update     # after a fix: tighten (review the diff, it must only shrink)
```

The audit sees only what CSS and TSX text show. A weight on a rule that inherits its family, or an `<h1 className={styles.x}>`, is invisible to it. The browser test and the rig measure the rendered result.

### 2. `tests/browser/page-bounds-baseline.json` (`tests/browser/page-bounds.spec.ts`, in `npm run test:browser`)

For every page at 1440 and 390, the test measures:

- `no-h1`: the page has no h1 (a visually hidden one is fine).
- `h1-align`: the visible h1's left edge is not where the content starts.
- `frame`: content lies outside 224–1216 at 1440, or outside 24–366 at 390.
- `page-scroll-x`: the page itself scrolls sideways.

The baseline is `{}` and the test is strict: every measured page passes at both widths, so any offence fails, and `UPDATE_BOUNDS_BASELINE=1` measures every page but refuses to write a non-empty baseline. Fix the page.

The test also fails when a page file under `pages/` is neither measured nor excluded with a reason (dynamic pages need a sample address in `SAMPLES`). It also checks that the 404 page renders on `--bg` in both themes.

## Migrating a page family: checklist

1. Replace the page's own header markup with `<PageHeader>` as a sibling of `<main>`. Delete the page's h1, eyebrow and header CSS.
2. Drop `main-wide`, per-feature gutters and fixed-width columns. Content fills `main` (992px at 1440) and uses `var(--page-gutter)`.
3. Section headings: `.op-section` plus `<h2>` (`--heading`, 18px) for sections and the global `h3` for sub-sections. Delete page-level heading colours, sizes and teal headings.
4. Controls:
   - pick-one groups become `SegmentedControl`
   - independent filters become `.filter-chip` with `aria-pressed`
   - dropdowns become `StyledSelect`
   - search fields become `SearchInput`
   - cards that are buttons get `.btn-bare`, plus `.pick-card` if they are selectable
   - destructive actions get `.danger`
   - delete the module or page-local variants
5. Borders on anything interactive use `var(--control-border)`, with hover to teal. Passive frames keep `--line` or `--line-soft`.
6. Replace rarity with `<Rarity>` or `.tier-N`. Categories use `--cat-*`. Replace any remaining literal colours with tokens (check the light theme).
7. Radii come from tokens only (2, 3 or 4px).
8. Horizontal rows use `ScrollRow` or `.sidescroll`. Nested vertical scrollers keep the default thumb. Put focus rings inside scrollers with `outline-offset: -2px`.
9. Hide "Coming soon" placeholders until they have content.
10. Density changes must obey the Anti-Page Jump rule. Measure them with `apj()`.
11. Run `npm run audit:styles` and the page-bounds test. If a remaining ratchet list shrank, tighten it with `npm run audit:styles -- --update` and commit the smaller baseline with the change.
12. Verify the rendered result at 1440 and 390, dark and light (the rig, or screenshots). A green build is not verification.
