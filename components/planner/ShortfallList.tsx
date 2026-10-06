import { usePlannerContent } from '@/lib/content/planner';
import { useMemo, useState } from 'react';
import type { Depot } from '@/lib/planner/depot';
import {
  type NeedRow,
  type Resolution,
} from '@/lib/planner/craft';
import { SOURCE_LABELS, type Source } from '@/lib/planner/sources';
import { shortfallHint } from '@/lib/planner/shortfallHint';
import { MaterialIcon } from './MaterialIcon';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import SegmentedControl from '@/components/ui/SegmentedControl';

/**
 * What to get next.
 *
 * The first panel on the page, because it is the first question: not what the
 * plan costs -- which is never the number you act on -- but what is missing
 * from it. One card per material, and by default only the ones that are short,
 * because a list of twelve where eight say "have" buries the four that need an
 * afternoon.
 *
 * The resolution arrives from the page rather than being computed here, and it
 * has to: the header's totals, the per-operator meters, the depot strip's amber
 * numbers and these cards are one answer read four ways, and four components
 * each resolving the plan for themselves is four answers that can disagree.
 *
 * Three crafting surfaces over that one result, which is the design's whole
 * argument: a whole-bill switch for whether the workbench counts at all, a
 * per-item declaration that pushes one material's requirement down a tier, and
 * the recipe itself on the card. The third exists because a material can be
 * craftable and still not completable -- Manganese Trihydrate is two Manganese
 * Ore, a Polyester Pack and a Loxic Kohl, and holding only the Kohl a green
 * tick would be a lie.
 */

/**
 * What to DO about a material, beyond naming the bench.
 *
 * Empty for the Workshop and the Factory, because the card already prints the
 * room in its own sub-label and "no stage runs needed" underneath it is the
 * same fact said twice, in a chip, in the space where a stage code would have
 * told the reader where to go.
 */
function sourceTags(name: string, short: number, lookup: (name: string) => Source): { text: string }[] {
  const source = lookup(name);
  if (source.kind === 'farm') return source.stages.slice(0, 3).map((code) => ({ text: code }));
  if (source.buy) {
    return [{
      /* The total for the shortfall, not the unit price: "90 each" is a fact
         about the shop, and "180 Purchase Certificates" is the thing you have
         to go and get. */
      text: source.buy.price && short > 0
        ? `${(source.buy.price * short).toLocaleString()} ${source.buy.currency}s`
        : `${source.buy.currency}s`,
    }];
  }
  if (source.kind === 'workshop' || source.kind === 'factory') return [];
  return [{ text: SOURCE_LABELS[source.kind].note }];
}

/** The same, for a row that has no other place to say where a material comes
 *  from -- so it never comes back empty. */
function whereChips(name: string, short: number, lookup: (name: string) => Source): { text: string }[] {
  const tags = sourceTags(name, short, lookup);
  return tags.length ? tags : [{ text: SOURCE_LABELS[lookup(name).kind].tag }];
}

/**
 * One level of a recipe, recursing into an ingredient the reader opens.
 *
 * The numbers are against the depot AS IT STANDS, not against what is left
 * after the rest of the plan has been served -- said out loud in the head,
 * because two recipes can both point at the same Loxic Kohl. Turning the craft
 * on moves the requirement into the answer proper, where the resolver settles
 * that contention highest-tier-first.
 */
/** How many of a material you hold, with a step either side: the depot grid's stepper
 *  (DepotGrid), so a count can be corrected where it is read rather than in the depot below. */
function HaveStepper({ name, have, onChange }: { name: string; have: number; onChange: (name: string, next: number) => void }) {
  return (
    <span className="depot-stepper recipe-stepper">
      <button type="button" aria-label={`One fewer ${name}`} disabled={have <= 0} onClick={() => onChange(name, have - 1)}>&minus;</button>
      <input type="number" min={0} inputMode="numeric" value={have || ''} placeholder="0" aria-label={`${name} you have`}
        onChange={(event) => onChange(name, Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
      <button type="button" aria-label={`One more ${name}`} onClick={() => onChange(name, have + 1)}>+</button>
    </span>
  );
}

function RecipeTree({
  name,
  want,
  depot,
  crafting,
  onCraftingToggle,
  onDepotChange,
  onClose,
  depth = 0,
}: {
  name: string;
  /** How many of `name` this level has to produce. */
  want: number;
  depot: Depot;
  crafting: ReadonlySet<string>;
  onCraftingToggle: (name: string) => void;
  /** Sets how many of a material the depot holds. */
  onDepotChange: (name: string, next: number) => void;
  onClose?: () => void;
  depth?: number;
}) {
  const [openIngredient, setOpenIngredient] = useState<string | null>(null);
  const { formulaFor, isCraftable, sourceFor } = usePlannerContent();
  const recipe = formulaFor(name);
  if (!recipe) return null;

  const runs = Math.max(1, Math.ceil(want / Math.max(1, recipe.count)));

  /* LMD twice over, because the data keeps it in two places: `lmd` is the
     bench fee and a Factory recipe can also name it as an ingredient. Both are
     the same money, so they land on one line. */
  const lmdPerRun = recipe.lmd + (recipe.costs.find((c) => c.name === 'LMD')?.count ?? 0);
  const rows = recipe.costs
    .filter((c) => c.name !== 'LMD')
    .map((c) => {
      const need = c.count * runs;
      const have = depot[c.name] || 0;
      return { name: c.name, per: c.count, need, have, short: Math.max(0, need - have) };
    });

  const shortRows = rows.filter((r) => r.short > 0);
  /* Only worth offering for something the resolver may actually descend into.
     The chip trades are F_ASC -- three Sniper Chips make a Caster Chip and
     three Caster Chips make a Sniper Chip, because those are class trades and
     not a ladder -- so "craft your Caster Chips" would send a reader round in
     a circle. */
  const offerable = shortRows.filter((r) => isCraftable(r.name) && !crafting.has(r.name));

  return (
    <div className="recipe">
      <div className="recipe-head">
        <span>
          Recipe &times;{runs} &mdash; {recipe.room === 'FACTORY' ? 'Factory' : 'Workshop'} yields {recipe.count}
          {lmdPerRun > 0 && <> &middot; {(lmdPerRun * runs).toLocaleString()} LMD at the bench</>}
        </span>
        <span className="why">
          {/* A class trade is not a tier step. Three Supporter Chips become two
              Vanguard Chips and three Vanguard Chips become two of something
              else -- a cycle, which is why the resolver will not walk it and
              why this says so instead of offering to. */}
          {!isCraftable(name)
            ? recipe.type === 'F_ASC'
              ? 'A class trade rather than a tier step -- a cycle, so the planner will not follow it for you.'
              : 'A real recipe, but its ingredients lead into the chip trades, so the planner will not follow it for you.'
            : shortRows.length === 0
              ? 'Every ingredient is covered, so this one can be made now.'
              : `${shortRows.length} of ${rows.length} short, so this cannot be finished by crafting yet.`}
        </span>
      </div>

      <div className="recipe-rows">
        {rows.map((r) => {
          const craftable = isCraftable(r.name);
          const open = openIngredient === r.name;
          return (
            <div key={r.name}>
              <div className={`recipe-row${r.short > 0 ? ' short' : ''}`}>
                <MaterialIcon name={r.name} size={24} />
                <span className="name">
                  {craftable && depth < 2 ? (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenIngredient(open ? null : r.name)}
                    >
                      {r.name}
                    </button>
                  ) : r.name}
                  <span className="per">&times;{r.per} each</span>
                </span>
                <span className="where">
                  {whereChips(r.name, r.short, sourceFor).map((t) => <em key={t.text}>{t.text}</em>)}
                </span>
                <span className="have"><HaveStepper name={r.name} have={r.have} onChange={onDepotChange} /> <span>/ {r.need}</span></span>
                {r.short > 0
                  ? <span className="gap">{r.short} short</span>
                  : <span className="status-ok"><i>&#10003;</i>Covered</span>}
              </div>
              {open && (
                <RecipeTree
                  name={r.name}
                  want={r.short || r.need}
                  depot={depot}
                  crafting={crafting}
                  onCraftingToggle={onCraftingToggle}
                  onDepotChange={onDepotChange}
                  onClose={() => setOpenIngredient(null)}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        })}
        {lmdPerRun > 0 && (
          <div className="recipe-row">
            <MaterialIcon name="LMD" size={24} />
            <span className="name">
              LMD
              <span className="per">&times;{lmdPerRun.toLocaleString()} each</span>
            </span>
            <span className="where"><em>Bench fee</em></span>
            <span className="have"><span>{(lmdPerRun * runs).toLocaleString()} total</span></span>
            <span className="status-ok"><i>&#10003;</i>In the LMD line</span>
          </div>
        )}
      </div>

      <div className="recipe-foot">
        <p className="hint plan-hint">
          Counted against your depot as it stands. Turn a craft on and the requirement
          moves into the answer above, where one Orirock Cube cannot be spent twice.
        </p>
        <span className="recipe-foot-acts">
          {offerable.slice(0, 2).map((r) => (
            <button key={r.name} type="button" className="ghost btn-sm" onClick={() => onCraftingToggle(r.name)}>
              Craft {r.name} too
            </button>
          ))}
          {onClose && (
            <button type="button" className="ghost btn-sm" onClick={onClose}>Hide recipe</button>
          )}
        </span>
      </div>
    </div>
  );
}

/** One material: what the plan wants, what is covered, and what to do about it. */
function NeedCard({
  row,
  depot,
  crafting,
  open,
  onOpen,
  onCraftingToggle,
}: {
  row: NeedRow;
  depot: Depot;
  crafting: ReadonlySet<string>;
  open: boolean;
  onOpen: () => void;
  onCraftingToggle: (name: string) => void;
}) {
  const { formulaFor, isCraftable, sourceFor } = usePlannerContent();
  const recipe = formulaFor(row.name);
  const declared = crafting.has(row.name);
  /* Being crafted, the material is no longer something to get: the count is how many the
     bench will make, and its ingredients are in the list as rows of their own. Its tally is
     what you hold of it, not what the craft will cover. */
  const crafted = declared && row.coverage === 'crafting';
  const covered = crafted ? row.fromDepot : row.need - row.short;
  const pct = row.need > 0 ? Math.round((covered / row.need) * 100) : 100;
  const source = sourceFor(row.name);
  const head = (
    <>
      <MaterialIcon name={row.name} size={34} />
      <span className="need-card-who">
        <b>{row.name}</b>
        <i>{SOURCE_LABELS[source.kind].tag}</i>
      </span>
      <span className="need-card-count">
        <b>{(row.short > 0 ? row.short : crafted ? row.fromCrafting : covered).toLocaleString()}</b>
        {/* The word, not just the colour: a bare number in amber is one
            carrier doing the whole job. */}
        <i>{row.short > 0 ? 'short' : crafted ? 'to craft' : 'have'}</i>
      </span>
    </>
  );
  /* What the count is FOR, wherever that is not simply "the upgrades": a material a craft
     draws on says how much goes to which craft, and how much the upgrades ask for besides. */
  const crafts = Object.entries(row.forCrafts ?? {});

  return (
    <div className={`need-card${open ? ' open' : ''}${row.short === 0 ? ' met' : ''}`}>
      {/* The whole head opens the recipe, not just the name. */}
      {recipe
        ? <button type="button" className="btn-bare need-card-top need-card-open" aria-expanded={open} aria-label={`${row.name}: ${open ? 'hide' : 'show'} its recipe`} onClick={onOpen}>{head}</button>
        : <div className="need-card-top">{head}</div>}

      <div className="need-card-bar">
        <span className="meter">
          <span className="meter-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="need-card-tally">{covered.toLocaleString()}/{row.need.toLocaleString()}</span>
      </div>

      {(crafts.length > 0 || crafted) && (
        <ul className="need-card-for">
          {crafted && <li className="is-craft">Crafting {row.fromCrafting.toLocaleString()}: its ingredients are listed as their own cards</li>}
          {crafts.length > 0 && row.direct > 0 && <li><b>{row.direct.toLocaleString()}</b> for upgrades</li>}
          {crafts.map(([product, count]) => <li key={product} className="is-craft"><b>{count.toLocaleString()}</b> for crafting {product}</li>)}
        </ul>
      )}

      <div className="need-card-tags">
        {sourceTags(row.name, row.short, sourceFor).map((t) => <em key={t.text}>{t.text}</em>)}
        {recipe && isCraftable(row.name) ? (
          /* Whether to craft this one is on or off, so it is a checkbox (ui-primitives
             rule 3): it was a button drawing its own tick box, in a --line border
             beside the stage codes. Named for its material, since every card has one. */
          <label
            className="check need-card-craft"
            title={declared
              ? `Stop crafting ${row.name}: its ingredients leave the list, and it is asked for directly again`
              : `Craft ${row.name}: add what it is made of (${recipe.costs.filter((c) => c.name !== 'LMD').map((c) => `${c.count}x ${c.name}`).join(' + ')}) to the list, to see whether you have it`}
          >
            <input type="checkbox" checked={declared} aria-label={`Craft ${row.name}`} onChange={() => onCraftingToggle(row.name)} />
            Craft
          </label>
        ) : recipe ? (
          /* A formula exists but the resolver will not walk it, and the two
             reasons are different things: F_ASC is a cycle of class swaps --
             three Supporter Chips for two Vanguard Chips and back again -- which
             a player can do and a planner must not plan. A Dualchip's recipe is
             a straight step at the Factory; it is left out of the walk because
             its ingredients lead down into that cycle. Calling both "class
             trade" was wrong about the Dualchip, whose recipe is real. */
          <em>{recipe.type === 'F_ASC' ? 'Class trade' : 'Factory recipe'}</em>
        ) : null}
      </div>
    </div>
  );
}

/** LMD and EXP: counted rather than held, and both measured against the depot. */
function CurrencyCard({
  kind,
  need,
  held,
  records,
}: {
  kind: 'LMD' | 'EXP';
  need: number;
  held: number;
  records: { name: string; count: number }[];
}) {
  const short = Math.max(0, need - held);
  const pct = need > 0 ? Math.round((Math.min(held, need) / need) * 100) : 100;
  return (
    <div className={`need-card${short === 0 ? ' met' : ''}`}>
      <div className="need-card-top">
        <MaterialIcon name={kind === 'LMD' ? 'LMD' : 'Drill Battle Record'} size={34} />
        <span className="need-card-who">
          <b>{kind}</b>
          <i>{kind === 'LMD' ? 'Currency' : 'Battle records'}</i>
        </span>
        <span className="need-card-count">
          <b>{short > 0 ? short.toLocaleString() : held.toLocaleString()}</b>
          <i>{short > 0 ? 'short' : 'covered'}</i>
        </span>
      </div>
      <div className="need-card-bar">
        <span className="meter"><span className="meter-fill" style={{ width: `${pct}%` }} /></span>
        <span className="need-card-tally">{Math.min(held, need).toLocaleString()}/{need.toLocaleString()}</span>
      </div>
      <div className="need-card-tags">
        {/* EXP is not a thing you can go and get; records are. */}
        <em>
          {kind === 'EXP'
            ? short > 0
              ? `≈ ${records.reduce((n, r) => n + r.count, 0)} records`
              : `${held.toLocaleString()} EXP of records held`
            : `${held.toLocaleString()} held`}
        </em>
      </div>
    </div>
  );
}

export function ShortfallList({
  resolution,
  depot,
  crafting,
  onCraftingToggle,
  onDepotChange,
  showAll,
  onShowAll,
  exp,
  lmd,
  goalCount,
  loading,
}: {
  resolution: Resolution;
  depot: Depot;
  crafting: ReadonlySet<string>;
  onCraftingToggle: (name: string) => void;
  /** Sets how many of a material the depot holds (the open recipe's steppers). */
  onDepotChange: (name: string, next: number) => void;
  /** Whether the covered materials are shown alongside the short ones. */
  showAll: boolean;
  onShowAll: (next: boolean) => void;
  /** The plan's EXP and LMD, the LMD already including the bench fees. */
  exp: number;
  lmd: number;
  goalCount: number;
  /** True while an operator in the plan still has no build data. */
  loading: boolean;
}) {
  const [openName, setOpenName] = useState<string | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  /* Reset on the plan's own shape, not on a toggle: All-materials, the open
     recipe and the farming route all shorten this panel. */
  const floor = useHeightFloor(resolution.rows.length);

  const rows = resolution.rows;
  const shortRows = useMemo(() => rows.filter((r) => r.short > 0), [rows]);
  /* Missing shows what is short and what the reader set to craft: a crafted material is no
     longer short (its ingredients carry the shortfall), and dropping its card would take its
     Craft box away from the one view the reader ticked it in. */
  const missingRows = useMemo(() => rows.filter((r) => r.short > 0 || r.coverage === 'crafting'), [rows]);
  const shown = showAll ? rows : missingRows;

  /* EXP is not held, records are: priced at the values in item_table.expItems,
     which is the same table the greedy split spends. */
  const { BATTLE_RECORDS, expToBattleRecords, stagesToRun, isCraftable, formulaFor, sourceFor } = usePlannerContent();
  const money = useMemo(() => {
    const heldExp = BATTLE_RECORDS.reduce((n, r) => n + (depot[r.name] || 0) * r.exp, 0);
    return { heldExp, heldLmd: depot.LMD || 0, expShort: Math.max(0, exp - heldExp) };
  }, [depot, exp, BATTLE_RECORDS]);
  const records = useMemo(() => expToBattleRecords(money.expShort), [money.expShort, expToBattleRecords]);
  const lmdShort = Math.max(0, lmd - money.heldLmd);

  const run = useMemo(() => stagesToRun(shortRows.map((r) => r.name)), [shortRows, stagesToRun]);

  const moneyShort = (money.expShort > 0 ? 1 : 0) + (lmdShort > 0 ? 1 : 0);
  const moneyWords = moneyShort === 2 ? 'LMD and EXP' : money.expShort > 0 ? 'EXP' : lmdShort > 0 ? 'LMD' : null;
  /* The sentence under the cards, derived from them (lib/planner/shortfallHint.ts). */
  const footHint = shortfallHint(shortRows, depot, moneyWords, { isCraftable, formulaFor, sourceFor });

  return (
    <>
      <div className="plan-panel-head">
        <span className="plan-panel-lead">
          <span className="label-pair">
            <span className="label-tag plan-panel-tag">What to get next</span>
            <h2 className="section-title">Still needed</h2>
          </span>
          {/* Derived from what renders, so the two cannot disagree. The leading dot is
              .plan-sep, which the lead hides where the count wraps under the title. */}
          <span className="hint plan-hint">
            <span className="plan-sep" aria-hidden="true">&middot;</span>{shortRows.length} of {rows.length} {rows.length === 1 ? 'material' : 'materials'} short
            {goalCount > 0 ? `, across ${goalCount} ${goalCount === 1 ? 'goal' : 'goals'}` : ''}
            {/* One unbreakable clause from the dot on, so a wrapped line never ends on
                the dot or an "and" (at 390 it read "...across 34 goals ·" over "and LMD
                and EXP"). */}
            {moneyWords ? `\u00a0·\u00a0and ${moneyWords}`.replace(/ /g, '\u00a0') : ''}
          </span>
        </span>
        <span className="plan-panel-acts planner-need-acts">
          {/* Two views of one answer (2026-10-03): what is still missing, and everything the plan
              asks for. The list counts raw materials only; the Workshop enters it one material
              at a time, through that material's Craft, which adds what it is made of. */}
          {rows.length > 0 && (
            <SegmentedControl<'missing' | 'all'>
              label="Which materials to show"
              className="planner-need-mode"
              value={showAll ? 'all' : 'missing'}
              onChange={(view) => onShowAll(view === 'all')}
              options={[{ value: 'missing', label: 'Missing', count: missingRows.length }, { value: 'all', label: 'All', count: rows.length }]}
            />
          )}
        </span>
      </div>

      <div className="plan-panel-body" ref={floor.ref}>
        {!rows.length && !exp && !lmd ? (
          <p className="hint plan-hint">
            {loading
              ? 'Working out what the plan costs...'
              : 'No goals set yet. Give an operator a target below and this fills in with what it will take.'}
          </p>
        ) : shown.length === 0 && moneyShort === 0 ? (
          <p className="hint plan-hint">
            Nothing is short. Every material the plan asks for is in your depot, or the
            Workshop can make it out of what is.
          </p>
        ) : (
          <div className="need-cards">
            {lmd > 0 && (showAll || lmdShort > 0) && (
              <CurrencyCard kind="LMD" need={lmd} held={money.heldLmd} records={[]} />
            )}
            {exp > 0 && (showAll || money.expShort > 0) && (
              <CurrencyCard kind="EXP" need={exp} held={money.heldExp} records={records} />
            )}
            {shown.map((row) => (
              <NeedCard
                key={row.name}
                row={row}
                depot={depot}
                crafting={crafting}
                open={openName === row.name}
                onOpen={() => setOpenName(openName === row.name ? null : row.name)}
                onCraftingToggle={onCraftingToggle}
              />
            ))}
          </div>
        )}

        {/* The open recipe sits under the grid rather than inside a card: it is
            five columns wide and a card is one, and at four cards across the
            reader would be reading a table through a letterbox. */}
        {openName && (
          <RecipeTree
            name={openName}
            want={rows.find((r) => r.name === openName)?.short || 1}
            depot={depot}
            crafting={crafting}
            onCraftingToggle={onCraftingToggle}
            onDepotChange={onDepotChange}
            onClose={() => setOpenName(null)}
          />
        )}

        {routeOpen && run.codes.length > 0 && (
          <div className="planner-need-stages">
            <span className="label-tag">Stages to run</span>
            <span className="planner-need-stagelist">
              {run.codes.map((code) => <em key={code} className="planner-need-stage">{code}</em>)}
            </span>
            {/* A cover, not a union: one stage usually drops several of these,
                which is the whole reason to show it. */}
            <span className="hint plan-hint">
              {run.codes.length} {run.codes.length === 1 ? 'stage covers' : 'stages cover'} all {run.covers} farmable{run.covers === 1 ? '' : 's'} you are short of
            </span>
          </div>
        )}

        {/* Nothing short means this whole row is carrying nothing: its sentence
            repeated the body's ("Nothing is short..." above, "Nothing short --
            the plan is covered by what you hold" here, stacked, neither aware of
            the other) and its only control is a farming route with no stages to
            plan. Gone in that state rather than reworded. */}
        {(shortRows.length > 0 || moneyShort > 0) && (
          <div className="plan-panel-foot">
            <p className="hint plan-hint">{footHint}</p>
            {/* Only when a short material drops from a stage: with none (a Dualchip,
                a shop item, only LMD and EXP left) the route has nothing to plan, and
                it sat here disabled with no reason given. Gone in that state, as Show
                all is with nothing to show. */}
            {run.codes.length > 0 && (
              <button
                type="button"
                className="filter-chip"
                aria-pressed={routeOpen}
                onClick={() => setRouteOpen((v) => !v)}
              >
                {routeOpen ? 'Hide farming route' : 'Farming route'}
              </button>
            )}
          </div>
        )}
        {floor.spacer}
      </div>
    </>
  );
}

/**
 * What one operator's own build costs, against the page's one resolution.
 *
 * Deliberately not a second ShortfallList. Resolving this operator's bill on
 * its own would spend the same Orirock Cube here and in the summary above, and
 * with four operators planned that is four claims on one cube -- so this reads
 * the shares the page already computed and states which of them are short.
 */
export function OperatorBill({
  bill,
  shares,
  depot,
}: {
  bill: { name: string; quantity: number | string }[];
  shares: Map<string, number>;
  depot: Depot;
}) {
  /* The release's lookup, like every other card here. This one used to fall back to
     the module-level sourceFor, which answered from the deploy's bundled tables. */
  const { sourceFor } = usePlannerContent();
  const rows = useMemo(() => {
    const out: { name: string; need: number; short: number }[] = [];
    for (const item of bill) {
      if (item.name === 'EXP' || item.name === 'LMD') continue;
      const need = Math.ceil(Number(item.quantity) || 0);
      if (need <= 0) continue;
      out.push({ name: item.name, need, short: Math.round(need * (shares.get(item.name) ?? 0)) });
    }
    return out;
  }, [bill, shares]);

  const exp = bill.find((i) => i.name === 'EXP');
  const lmd = bill.find((i) => i.name === 'LMD');
  const short = rows.filter((r) => r.short > 0);

  if (!rows.length && !exp && !lmd) {
    return <p className="hint plan-hint">Nothing to buy &mdash; this operator is already where you want them.</p>;
  }

  return (
    <>
      <div className="planner-need-head">
        <span className="planner-need-headline">
          <span className="label-tag planner-depot-grouptag">This operator</span>
          <span className="planner-need-headcount">
            {short.length} of {rows.length} {rows.length === 1 ? 'material' : 'materials'} short
          </span>
          <span className="hint plan-hint">against the whole plan&apos;s claim on your depot</span>
        </span>
      </div>
      <div className="short-list">
        {(lmd || exp) && (
          <div className="short-row">
            <div className="short-row-main">
              <MaterialIcon name="LMD" size={30} />
              <span className="name">Levels and promotions</span>
              <span className="where" />
              <span className="have">
                {lmd ? <b>{Math.ceil(Number(lmd.quantity)).toLocaleString()}</b> : null}
                <span> LMD</span>
              </span>
              <span className="gap">
                {exp ? `${Math.ceil(Number(exp.quantity)).toLocaleString()} EXP` : ''}
              </span>
              <span className="craft-none" aria-hidden="true">&mdash;</span>
            </div>
          </div>
        )}
        {rows.map((r) => (
          <div key={r.name} className="short-row">
            <div className="short-row-main">
              <MaterialIcon name={r.name} size={30} />
              <span className="name">{r.name}</span>
              <span className="where">
                {whereChips(r.name, r.short, sourceFor).map((t) => <em key={t.text}>{t.text}</em>)}
              </span>
              <span className="have">
                <b>{(r.need - r.short).toLocaleString()}</b><span> / {r.need.toLocaleString()}</span>
              </span>
              {r.short > 0
                ? <span className="gap">{r.short.toLocaleString()} short</span>
                : <span className="status-ok"><i>&#10003;</i>Have</span>}
              <span className="craft-none" aria-hidden="true">&mdash;</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
