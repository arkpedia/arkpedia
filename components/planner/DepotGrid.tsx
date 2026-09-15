import { useEffect, useMemo, useRef, useState } from 'react';
import { useHeightFloor } from './useHeightFloor';
import { IN_GAME_ORDER, MATERIAL_GROUPS, MATERIAL_SORT_ORDER } from '@/lib/farming/materialSortOrder';
import { matchesSearch } from '@/lib/searchNormalize';
import type { CostGroup } from '@/lib/operators/operatorTypes';
import type { Depot } from '@/lib/planner/depot';
import { MaterialIcon } from './MaterialIcon';

/**
 * What you own, and what the plan wants of it.
 *
 * One component, and the game's own order by default -- because the job people
 * actually do here is sit with the game open beside the browser and copy
 * across, and for that the only order that helps is the one already on the
 * other screen. You read down one list and type down the other without
 * hunting. Tier order stays available as an arrangement, but it is not the
 * default: tiers are how the crafting resolver reads the catalogue, not how a
 * player reads their own depot.
 *
 * There is no save button. Every keystroke writes, and the shortfall above
 * recalculates from it.
 */

export type DepotSort = 'ingame' | 'az' | 'tier' | 'needed';

const SORTS: [DepotSort, string][] = [
  ['ingame', 'Game order'],
  ['az', 'A–Z'],
  ['tier', 'By tier'],
  ['needed', 'Only what I need'],
];

/** Held against wanted, for one material. `need` 0 means the plan never names it. */
interface Held {
  name: string;
  have: number;
  need: number;
  short: number;
}

const IN_GAME_INDEX = new Map(IN_GAME_ORDER.map((name, i) => [name, i]));

/**
 * One material in the catalogue.
 *
 * Three ways to change it, because they suit three different jobs. Left-click
 * the tile adds one and right-click takes one away, which is the fast way to
 * tick off what a run dropped; the shoulders do the same for touch, where
 * there is no such thing as a right-click; and the number is typeable, because
 * entering a depot from scratch means 162 Orirock and nobody presses + that
 * many times.
 */
function DepotTile({
  item,
  changed,
  onChange,
}: {
  item: Held;
  changed: boolean;
  onChange: (name: string, next: number) => void;
}) {
  const set = (next: number) => onChange(item.name, Math.max(0, next));
  return (
    <div
      className={
        'depot-tile' +
        (item.have === 0 ? ' empty' : '') +
        (item.short > 0 ? ' short' : '') +
        (changed ? ' changed' : '') +
        /* LMD, and anything else that gets into six figures, needs a longer
           field than a tier-3 material ever will. */
        (item.have >= 100000 || item.need >= 100000 ? ' wide' : '')
      }
      title={`${item.name} — click to add one, right-click to remove one`}
      onClick={() => set(item.have + 1)}
      /* Without preventDefault the browser's own menu opens over the tile you
         just decremented. */
      onContextMenu={(e) => { e.preventDefault(); set(item.have - 1); }}
    >
      <MaterialIcon name={item.name} size={30} />
      <span className="name">
        {item.name}
        {/* Only where the plan asks for it, and amber once stock is under it.
            The number is what the plan WANTS, not what is missing: the field
            beside it already says what you have, and two subtractions in one
            tile is one too many to do in your head. */}
        {item.need > 0 && <span className="want">Plan wants {item.need.toLocaleString()}</span>}
      </span>
      {/* Clicks inside the stepper stop here: the shoulders have their own
          handlers and the field wants focus, not an increment. Right-click
          still falls through to the tile, except on the field itself, where
          the native menu is worth more than another way to subtract one. */}
      <span className="depot-stepper" onClick={(e) => e.stopPropagation()}>
        {/* tabIndex -1 on both shoulders, so Tab walks field to field. This is
            a data-entry grid -- ninety-odd numbers to type -- and with the
            buttons in the tab order every field cost two or three presses to
            reach instead of one. Nothing keyboard-reachable is lost: a number
            input increments on Up and Down, which is exactly what these do,
            and both keep their labels for button navigation. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`One fewer ${item.name}`}
          disabled={item.have <= 0}
          onClick={() => set(item.have - 1)}
        >
          &minus;
        </button>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={item.have || ''}
          /* An em dash, not a zero. Most of this grid is empty for most
             readers, and sixty solid zeroes is a wall to read six real counts
             out of -- and it means nobody ever has to type a 0. */
          placeholder="&mdash;"
          aria-label={item.name}
          onContextMenu={(e) => e.stopPropagation()}
          onChange={(e) => set(Math.floor(Number(e.target.value) || 0))}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`One more ${item.name}`}
          onClick={() => set(item.have + 1)}
        >
          +
        </button>
      </span>
    </div>
  );
}

export function DepotGrid({
  catalogue,
  planNeeds,
  depot,
  onChange,
}: {
  catalogue: string[];
  /** What the WHOLE plan asks for -- the depot is one store, filled once, so
   *  leading with what one of four operators happens to want would hide the
   *  other three. */
  planNeeds: CostGroup;
  depot: Depot;
  onChange: (name: string, next: number) => void;
}) {
  const [sort, setSort] = useState<DepotSort>('ingame');
  const [query, setQuery] = useState('');
  /* What this visit has touched. The highlight says "that keystroke landed" on
     a grid of ninety-three near-identical tiles. */
  const [changed, setChanged] = useState<Set<string>>(new Set());

  const record = (name: string, next: number) => {
    if ((depot[name] || 0) === next) return;
    setChanged((prev) => prev.has(name) ? prev : new Set(prev).add(name));
    onChange(name, next);
  };

  /* One record per material the depot can hold. Everything below is a
     different arrangement of this same list. */
  const held: Held[] = useMemo(() => {
    const inCatalogue = new Set(catalogue);
    const wanted = new Map<string, number>();
    for (const item of planNeeds) {
      /* EXP is a number an operator needs, not a thing you hold -- there is no
         tile for it, so there is nothing for a want line to sit on. */
      if (item.name === 'EXP') continue;
      wanted.set(item.name, (wanted.get(item.name) || 0) + Math.ceil(Number(item.quantity) || 0));
    }
    return MATERIAL_SORT_ORDER
      .filter((name) => name !== 'EXP' && inCatalogue.has(name))
      .map((name) => {
        const have = depot[name] || 0;
        const need = wanted.get(name) || 0;
        return { name, have, need, short: Math.max(0, need - have) };
      });
  }, [catalogue, planNeeds, depot]);

  const byName = useMemo(() => new Map(held.map((h) => [h.name, h])), [held]);

  const groups = useMemo(
    () => MATERIAL_GROUPS
      .map((g) => ({ tag: g.tag, items: g.names.map((n) => byName.get(n)).filter(Boolean) as Held[] }))
      .filter((g) => g.items.length > 0),
    [byName],
  );

  /**
   * What the grid shows, in the order it shows it.
   *
   * The search box narrows; the sort arranges. (A stage filter used to narrow
   * first -- "show me what the stage I just ran drops" -- and was removed as
   * unnecessary: it could only ever hide tiles, since the drop COUNTS are in no
   * table the site keeps, so it saved no typing.)
   */
  const shown = useMemo(() => {
    let list = held;
    const q = query.trim();
    /* (haystack, needle), which is the order every other caller on the site
       uses. Written the other way round this asks whether the QUERY contains
       the material name, and "orirock" matches nothing but a material called
       exactly that. */
    if (q) list = list.filter((h) => matchesSearch(h.name, q));
    if (sort === 'needed') {
      return list.filter((h) => h.need > 0).sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
    }
    if (sort === 'az') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    /* The game's own order. Anything the transcription does not cover would
       sort last rather than vanish -- the import-time check in
       materialSortOrder.ts means there is nothing in that position today. */
    return [...list].sort((a, b) => {
      const ai = IN_GAME_INDEX.get(a.name) ?? Infinity;
      const bi = IN_GAME_INDEX.get(b.name) ?? Infinity;
      return ai - bi || a.name.localeCompare(b.name);
    });
  }, [held, query, sort]);

  /* By tier keeps the game's own headings, so it is grouped rather than sorted
     -- but it still obeys the filters above it. */
  const tierGroups = useMemo(() => {
    if (sort !== 'tier') return [];
    const keep = new Set(shown.map((h) => h.name));
    return groups
      .map((g) => ({ tag: g.tag, items: g.items.filter((i) => keep.has(i.name)) }))
      .filter((g) => g.items.length > 0);
  }, [sort, shown, groups]);

  /* Anti-Page-Jump: `Only what I need` takes ninety-three tiles down to a
     handful, which can drop the document below what the reader's scroll
     position needs. The reserve is the shared hook, so it also covers the tier
     headings appearing and the empty-state line replacing the grid. */
  const floor = useHeightFloor(catalogue.length);

  return (
    <>
      <div className="planner-depot-controls">
        <input
          type="search"
          className="planner-depot-filter"
          placeholder="Find an item..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a material by name"
        />
        <span className="tabs planner-depot-views">
          {SORTS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              /* aria-pressed alone. The class this used to carry, `is-active`,
                 matched no rule in the theme -- only `.tab.active` existed --
                 so the chosen arrangement had no highlight. The attribute is
                 both the announcement and the paint now. */
              className="tab"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      <div className="key-hint">
        <b>Keyboard</b>
        <span>
          <kbd>Tab</kbd> steps to the next item in the same order &middot; type the number
          &middot; <kbd>Tab</kbd> again. Leave a box empty and it stays at zero.
        </span>
      </div>

      <div ref={floor.ref}>
        {sort === 'tier' ? (
          tierGroups.map((g) => (
            <div key={g.tag} className="planner-depot-group open">
              <div className="planner-depot-grouphead">
                <span className="label-tag planner-depot-grouptag">{g.tag}</span>
                <span className="hint">{g.items.filter((i) => i.have > 0).length} of {g.items.length} held</span>
              </div>
              <div className="depot-grid">
                {g.items.map((item) => (
                  <DepotTile key={item.name} item={item} changed={changed.has(item.name)} onChange={record} />
                ))}
              </div>
            </div>
          ))
        ) : shown.length ? (
          <div className="depot-grid">
            {shown.map((item) => (
              <DepotTile key={item.name} item={item} changed={changed.has(item.name)} onChange={record} />
            ))}
          </div>
        ) : null}

        {!shown.length && (
          <p className="hint">
            {sort === 'needed'
              ? 'Nothing is planned yet, so nothing is needed. Add an operator above, or switch to Game order to fill the depot in.'
              : `Nothing matches “${query}”.`}
          </p>
        )}
        {floor.spacer}
      </div>
    </>
  );
}
