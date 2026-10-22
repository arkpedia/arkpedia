import { PlannerStateLabel } from "./PromotionIcon";
import { sortClasses } from '@/lib/operators/classOrder';
import Image from '@/components/content/ContentImage';
import { useEffect, useMemo, useRef } from 'react';
import { getClassIconPath } from '@/lib/operators/classBranchIcons';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { PlannerOperatorSummary } from '@/lib/operators/operatorTypes';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import type { Roster } from '@/lib/planner/roster';
import SearchInput from '@/components/ui/SearchInput';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';

/**
 * Every operator, as a face.
 *
 * Getting a roster into the site is a recognition job, not a recall job. The
 * old picker was a search box, which is the right tool for reaching one
 * operator you can name and the wrong one for a hundred and fifty you can only
 * recognise: it made you type every name, and offered nothing to scroll. So
 * this is the whole cast in a grid, the ones you own in colour and the rest
 * greyed, which is how Krooster does it and how the game's own squad screen
 * does it. You read down the grid the way you read down your barracks.
 *
 * A tile opens its operator. It does not toggle ownership, because a tap that
 * un-records an E2 Lv90 by accident has nothing standing between it and the
 * loss; ownership is a stated control inside the editor instead, and setting
 * any value there implies it.
 *
 * The filters are the site's own -- the class icons and the rarity chips from
 * /operators -- plus owned / not owned, which is the one axis this grid has
 * that page does not. Sort is fixed at rarity then name, the order the game's
 * squad list uses.
 */

/** The game's own class order, not alphabetical -- the squad screen's filter
 *  runs Vanguard to Specialist, and a reader who plays it expects the same. */

/**
 * How the grid is narrowed. Owned by the dialog, not by this component: the
 * grid unmounts while an operator is open, and a reader who narrowed it to
 * their 6-star Snipers and stepped into one expects the same seventeen faces
 * when they step back out -- not four hundred and Aak.
 */
export interface RosterFilters {
  query: string;
  className: string | null;
  rarity: number | null;
  owned: 'all' | 'owned' | 'unowned';
}
export const NO_FILTERS: RosterFilters = { query: '', className: null, rarity: null, owned: 'all' };

/** "E2 Lv60 SL7" -- the three axes a face has room for. Masteries and modules
 *  are the editor's to show; here the line says how far along you have told
 *  the site this operator is, which is what you are checking as you scroll. */
function tileState(roster: Roster, name: string): string | null {
  const owned = roster[name];
  if (!owned) return null;
  return `E${owned.elite} Lv${owned.level} SL${owned.skillLevel}`;
}

export function RosterGrid({
  mode = 'roster',
  operators,
  roster,
  inPlan,
  filters,
  onFilters,
  returnTo,
  onOpen,
  searchRef,
}: {
  /**
   * Which errand this grid is serving.
   *
   * `roster` offers everybody, with Owned / Not owned as filters, because
   * recording ownership IS the act of finding one that is not lit yet.
   * `goal` offers the operators you have and nothing else, with one control to
   * widen it -- a goal for an operator you do not own is the exception, and
   * two chips for one question ("Owned" plus "Add a new operator") would be
   * two ways to say the same thing.
   */
  mode?: 'roster' | 'goal';
  operators: PlannerOperatorSummary[];
  roster: Roster;
  inPlan: ReadonlySet<string>;
  filters: RosterFilters;
  onFilters: (next: RosterFilters) => void;
  /** The operator the reader just stepped back from. Their tile is scrolled
   *  into view and focused, so Back lands on the face you were editing rather
   *  than at the top of the grid. */
  returnTo?: string | null;
  /** The tile pressed, and every tile in the order the grid is showing them --
   *  so the editor's Previous / Next walk the grid as the reader filtered it. */
  onOpen: (name: string, order: string[]) => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { query, className: classFilter, rarity: rarityFilter, owned: ownedFilter } = filters;
  const set = (patch: Partial<RosterFilters>) => onFilters({ ...filters, ...patch });
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!returnTo) return;
    const tile = tileRefs.current.get(returnTo);
    if (!tile) return;
    tile.scrollIntoView({ block: 'center' });
    tile.focus({ preventScroll: true });
    /* On arrival only: the tile is where you came back to, not where you are
       pinned. Typing in the search afterwards must not drag it back. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Only the classes and rarities the list actually has, in the game's order. */
  const classes = useMemo(() => {
    const present = new Set(operators.map((o) => o.className).filter((c): c is string => !!c));
    return sortClasses(present);
  }, [operators]);
  const rarities = useMemo(
    () => Array.from(new Set(operators.map((o) => o.rarity).filter((r): r is number => r != null))).sort((a, b) => b - a),
    [operators],
  );

  const shown = useMemo(() => {
    const q = query.trim();
    const hit = (o: PlannerOperatorSummary) =>
      !q || matchesSearch(o.name, q) || (o.aliases ?? []).some((a) => matchesSearch(a, q));
    const rank = (o: PlannerOperatorSummary) =>
      Math.min(searchRelevance(o.name, q), ...(o.aliases ?? []).map((a) => searchRelevance(a, q)));
    return operators
      .filter((o) => hit(o)
        && (classFilter === null || o.className === classFilter)
        && (rarityFilter === null || o.rarity === rarityFilter)
        && (ownedFilter === 'all' || (ownedFilter === 'owned') === (o.name in roster)))
      .sort((a, b) => (
        /* With something typed, the closest match leads; otherwise the game's
           own order, rarity down and then the name. */
        (q ? rank(a) - rank(b) : 0)
        || (b.rarity || 0) - (a.rarity || 0)
        || a.name.localeCompare(b.name)
      ));
  }, [operators, roster, query, classFilter, rarityFilter, ownedFilter]);

  const ownedCount = useMemo(() => operators.filter((o) => o.name in roster).length, [operators, roster]);
  const order = useMemo(() => shown.map((o) => o.name), [shown]);
  const filtered = !!query.trim() || classFilter !== null || rarityFilter !== null || ownedFilter !== 'all';

  return (
    <>
      <div className="wizard-tools">
        <SearchInput
          inputRef={searchRef}
          className="wizard-search"
          label="Search operators"
          placeholder="Search every operator..."
          value={query}
          onChange={(value) => set({ query: value })}
        />
        {/* Independent filters, each pressed again to let go: .filter-chip with
            aria-pressed, not the primary/ghost pair (--teal-fill is for actions). */}
        <div className="roster-filters">
          <span className="wizard-filter-group" role="group" aria-label="Class">
            {classes.map((c) => {
              const icon = getClassIconPath(c);
              return (
                <button
                  type="button"
                  key={c}
                  className="filter-chip wizard-class-chip"
                  aria-label={c}
                  title={c}
                  aria-pressed={classFilter === c}
                  onClick={() => set({ className: classFilter === c ? null : c })}
                >
                  {icon && <OperatorGameIcon src={icon} label={c} size={24} />}
                </button>
              );
            })}
          </span>
          <span className="wizard-filter-group" role="group" aria-label="Rarity">
            {rarities.map((r) => (
              <button
                type="button"
                key={r}
                className="filter-chip"
                aria-pressed={rarityFilter === r}
                onClick={() => set({ rarity: rarityFilter === r ? null : r })}
              >
                <Rarity n={rarityLevel(r)} />
              </button>
            ))}
          </span>
          {mode === 'roster' ? (
            <span className="wizard-filter-group" role="group" aria-label="Ownership">
              <button
                type="button"
                className="filter-chip"
                aria-pressed={ownedFilter === 'owned'}
                onClick={() => set({ owned: ownedFilter === 'owned' ? 'all' : 'owned' })}
              >
                Owned
              </button>
              <button
                type="button"
                className="filter-chip"
                aria-pressed={ownedFilter === 'unowned'}
                onClick={() => set({ owned: ownedFilter === 'unowned' ? 'all' : 'unowned' })}
              >
                Not owned
              </button>
            </span>
          ) : (
            /* The one way out of "only what I own", and it says what pressing it
               is FOR rather than what it filters -- you are here to add a goal,
               and the operator you want may be one you have not recorded. */
            <button
              type="button"
              className="filter-chip roster-widen"
              aria-pressed={ownedFilter === 'all'}
              onClick={() => set({ owned: ownedFilter === 'all' ? 'owned' : 'all' })}
            >
              <span aria-hidden="true">{ownedFilter === 'all' ? '\u2713' : '+'}</span>
              Add a new operator
            </button>
          )}
          <span className="hint plan-hint roster-filters-count">
            {/* Derived from the tiles, both halves of it. */}
            {filtered ? `${shown.length} of ${operators.length} shown · ` : ''}{ownedCount} owned
          </span>
          {mode === 'goal' && ownedFilter === 'owned' && (
            <span className="visually-hidden">Showing only operators you own.</span>
          )}
        </div>
      </div>

      <div className="wizard-body">
        {shown.length === 0 ? (
          <p className="hint plan-hint">
            {query.trim()
              ? <>Nothing matches &ldquo;{query}&rdquo;{mode === 'goal' && ownedFilter === 'owned' ? ' among the operators you own — press Add a new operator to reach the rest' : ''}.</>
              : mode === 'goal' && ownedFilter === 'owned'
                ? 'You have not recorded any operators yet. Press Add a new operator, or fill in Your roster first.'
                : 'Nothing matches these filters.'}
          </p>
        ) : (
          <div className="roster-tiles">
            {shown.map((op) => {
              const state = tileState(roster, op.name);
              const planned = inPlan.has(op.name);
              return (
                <button
                  type="button"
                  key={op.name}
                  ref={(el) => { if (el) tileRefs.current.set(op.name, el); else tileRefs.current.delete(op.name); }}
                  className={`btn-bare roster-tile${state ? ' owned' : ''}${planned ? ' planned' : ''}`}
                  aria-label={`${op.name}${op.cnOnly ? ' (CN only)' : ''} — ${state ? `owned, ${state}` : 'not owned'}${planned ? ', in the plan' : ''}`}
                  title={`${op.name}${op.cnOnly ? ' · CN only' : ''}${planned ? ' · in the plan' : ''}`}
                  onClick={() => onOpen(op.name, order)}
                >
                  <span className="roster-tile-face">
                    <Image src={getOperatorIconPath(op)} alt="" width={88} height={88} />
                    <span className={`tier-${op.rarity || 1}`} />
                  </span>
                  <b>{op.name}</b>
                  {/* Empty rather than absent for an operator you do not own, so
                      every tile is the same height and the grid's rows line up.
                      The dimming carries the state to the eye; the aria-label
                      carries it in words. */}
                  {/* Not on Global yet (plannerOperators): says CN on the line an unowned tile leaves empty. */}
                  <i>{state ? <PlannerStateLabel label={state} /> : op.cnOnly ? 'CN' : ' '}</i>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
