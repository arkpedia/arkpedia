import { addCostGroup, totalsToCostGroup } from "@/lib/planner/plannerLogic";
import { PromotionIcon } from "./PromotionIcon";
import { useMemo, useState } from "react";
import Image from "@/components/content/ContentImage";
import type {
  PlannerOperator,
  PlannerOperatorSummary,
  CostGroup,
} from "@/lib/operators/operatorTypes";
import { getOperatorIconPath } from "@/lib/operators/operatorIcon";
import { matchesSearch, searchRelevance } from "@/lib/search/searchNormalize";
import type { BuilderState } from "@/lib/planner/builderStates";
import { upgradeCostGroups } from "@/lib/planner/upgradeCostGroups";
import { usePlannerContent } from "@/lib/content/planner";
import { sortMaterials } from "@/lib/farming/materialSortOrder";
import { plannerModules } from "@/lib/planner/build";
import { MaterialIcon } from "./MaterialIcon";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Tabs, { tabId, tabPanelProps } from "@/components/ui/Tabs";
import { useSwitchHold } from "@/components/ui/useSwitchHold";
import SearchInput from "@/components/ui/SearchInput";
import Rarity, { rarityLevel } from "@/components/ui/Rarity";

function Materials({ cost, missingShares }: { cost: CostGroup; missingShares?: Map<string, number> }) {
  /* The release's catalogue order, which the page's props carry (usePlannerContent). */
  const { catalogue } = usePlannerContent();
  const shown = missingShares ? cost.map(item => ({ ...item, quantity: Math.round(Number(item.quantity) * (missingShares.get(item.name) ?? 0)) })) : cost;
  const items = sortMaterials(shown.filter((c) => Number(c.quantity) > 0), catalogue.order);
  return items.length ? (
    <ul className="simple-materials">
      {items.map((c) => (
        <li key={c.name} title={c.name} aria-label={`${c.name}: ${Math.ceil(Number(c.quantity)).toLocaleString()}`}>
          {c.name === "EXP" ? (
            <MaterialIcon name="Strategic Battle Record" size={42} />
          ) : (
            <MaterialIcon name={c.name} size={42} />
          )}
          <span>
            <b>{Math.ceil(Number(c.quantity)).toLocaleString()}</b>
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="simple-no-cost">{missingShares ? 'No missing materials for these upgrades.' : 'No upgrades selected'}</p>
  );
}

export function SimpleMaterialGroups({
  op,
  state,
  missingShares,
}: {
  missingShares?: Map<string, number>;
  op: PlannerOperator;
  state: BuilderState;
}) {
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<'total' | 'separate'>('total');
  const { levels } = usePlannerContent();
  const groups = useMemo(() => upgradeCostGroups(op, state, levels), [op, state, levels]);
  const total = useMemo(() => {
    const quantities = new Map<string, number>();
    groups.forEach(group => addCostGroup(quantities, group.cost));
    return totalsToCostGroup(quantities);
  }, [groups]);
  return (
    <div className="simple-cost-groups">
      {missingShares && <SegmentedControl label="Which operator materials to show" value={showAll ? 'all' : 'missing'} onChange={value => setShowAll(value === 'all')} options={[{ value: 'missing', label: 'Missing' }, { value: 'all', label: 'All' }]} />}
      <SegmentedControl
        label="Material display"
        className="simple-material-view"
        value={view}
        onChange={setView}
        options={[{ value: 'total', label: 'Total' }, { value: 'separate', label: 'Separate' }]}
      />
      {view === 'total' ? <Materials cost={total} missingShares={showAll ? undefined : missingShares} /> : groups.map(g => (
        <section key={g.name}>
          <h3>{g.name}</h3>
          <Materials cost={g.cost} missingShares={showAll ? undefined : missingShares} />
        </section>
      ))}
    </div>
  );
}

/** The All tab's value: no operator is named "". */
const ALL_MATERIALS = "";

function Level({ elite, level }: { elite: number; level: number }) {
  return (
    <>
      <PromotionIcon elite={elite} size={26} /> Lv. {level}
    </>
  );
}

export function SimplePlanner({
  levelsLocked,
  operators,
  selectedNames,
  states,
  details,
  bills,
  combinedBill,
  selected,
  onSelect,
  onEdit,
  onRemove,
  onRetry,
  failedNames,
  clearControl,
  materialsPanel,
  missingShares,
}: {
  missingShares?: Map<string, number>;
  clearControl?: React.ReactNode;
  materialsPanel?: React.ReactNode;
  operators: PlannerOperatorSummary[];
  selectedNames: string[];
  states: Record<string, BuilderState>;
  details: Record<string, PlannerOperator>;
  bills: Record<string, CostGroup>;
  combinedBill: CostGroup;
  failedNames: Set<string>;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onEdit: (name: string, step?: "current" | "goal") => void;
  /** The starting levels' lock (pages/planner.tsx): "Set current" reads "Locked". */
  levelsLocked: boolean;
  onRemove: (name: string) => void;
  onRetry: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  /* An operator's dossier is taller than All materials, so switching back to All (or
     removing the operator on show) from the foot of a dossier can shorten the page
     under the reader: the Anti-Page Jump hold, taken in the handler before the switch.
     (A 249px clamp on a phone was seen in one test run; it did not reproduce.) */
  const viewHold = useSwitchHold("planner-simple");
  const matches = useMemo(
    () =>
      operators
        .filter((op) =>
          [op.name, ...(op.aliases ?? [])].some((n) =>
            matchesSearch(n, query.trim()),
          ),
        )
        .sort(
          (a, b) =>
            searchRelevance(a.name, query.trim()) -
              searchRelevance(b.name, query.trim()) ||
            (b.rarity || 0) - (a.rarity || 0) ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 20),
    [operators, query],
  );
  const name = selected && selectedNames.includes(selected) ? selected : null;
  const summary = operators.find((o) => o.name === name);
  const op = name ? details[name] : null;
  const state = name ? states[name] : null;
  const pending = selectedNames.filter((n) => !bills[n]);
  return (
    <div>
      <div className="simple-search-row">
      {/* The site's search field with its suggestion list: it was a hand-built
          input and list of its own. Enter still takes the first match. */}
      <SearchInput
        id="planner-search"
        className="simple-search"
        label="Search operators"
        placeholder="Search operators…"
        value={query}
        onChange={setQuery}
        suggestions={matches}
        getKey={(o) => o.name}
        suggestLabel="Matching operators"
        emptyText="No operators found"
        renderSuggestion={(o) => (
          <>
            <Image src={getOperatorIconPath(o)} alt="" width={36} height={36} className={o.rarity ? `tier-${rarityLevel(o.rarity)}` : undefined} />
            <span className="simple-search-text">
              <b>{o.name}</b>
              {/* Not on Global yet (plannerOperators): plannable all the same, and says CN. */}
              <small>{o.rarity ? <Rarity n={rarityLevel(o.rarity)} /> : null} {o.className}{o.cnOnly ? ' · CN' : ''}</small>
            </span>
            <span className="simple-search-add">{selectedNames.includes(o.name) ? "Edit" : "+"}</span>
          </>
        )}
        onPick={(o) => { setQuery(""); onEdit(o.name); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.defaultPrevented && matches[0]) {
            e.preventDefault();
            onEdit(matches[0].name);
            setQuery("");
          }
        }}
      />
      {clearControl}</div>
      {selectedNames.length > 0 ? (
        <>
          {/* The site's tabs: All, then one per planned operator, each removable.
              A tab may not hold a button, so the × is the mouse's way to remove
              one and Delete (or Backspace) on the focused tab is the keyboard's. */}
          <Tabs
            label="View materials for"
            id="planner-operator"
            className="simple-operator-tabs"
            value={name ?? ALL_MATERIALS}
            onChange={(value) => { viewHold.capture(); onSelect(value === ALL_MATERIALS ? null : value); }}
            options={[
              { value: ALL_MATERIALS, label: "All" },
              ...selectedNames.map((n) => {
                const o = operators.find((o) => o.name === n);
                return {
                  value: n,
                  label: n,
                  icon: o ? <Image src={getOperatorIconPath(o)} alt="" width={32} height={32} /> : undefined,
                };
              }),
            ]}
            removable={{
              onRemove: (value) => { viewHold.capture(); onRemove(value); },
              label: (option) => (option.value === ALL_MATERIALS ? null : `Remove ${option.value} from plan`),
            }}
          />
          <div ref={viewHold.ref} style={viewHold.style}>
          {name && summary && state ? (
            <article className="simple-dossier" {...tabPanelProps("planner-operator", name)}>
              <div className="simple-portrait">
                <Image
                  src={summary.art || getOperatorIconPath(summary)}
                  alt={name}
                  fill
                  sizes="(max-width: 640px) 160px, 300px"
                />
                <div className="simple-portrait-caption">
                  <span>
                    {summary.rarity ? <Rarity n={rarityLevel(summary.rarity)} /> : null} {summary.className}
                  </span>
                  <h2 className="entity-title">{name}</h2>
                </div>
              </div>
              <div className="simple-dossier-content">
                <div className="simple-build-overview">
                  <div className="simple-build-summary">
                    <button type="button" className="btn-bare simple-state-link" onClick={() => onEdit(name, "current")}>
                      <small>Current Level</small>
                      <b>
                        <Level
                          elite={state.startingElite}
                          level={state.startingLevel}
                        />
                      </b>
                      <span className="simple-state-action">{levelsLocked ? 'Locked' : 'Set current'}</span>
                    </button>
                    <span aria-hidden="true">→</span>
                    <button type="button" className="btn-bare simple-state-link" onClick={() => onEdit(name, "goal")}>
                      <small>Goal</small>
                      <b>
                        <Level elite={state.elite} level={state.level} />
                      </b>
                      <span className="simple-state-action">Set goal</span>
                    </button>
                  </div>
                  <div className="simple-upgrade-labels">
                    <span>
                      Skill rank {state.startingSkillLevel} → {state.skillLevel}
                    </span>
                    {Object.entries(state.masteryTargets)
                      .filter(([, m]) => m > 0)
                      .map(([i, m]) => (
                        <span key={i}>
                          S{Number(i) + 1} M
                          {state.startingMasteryLevels[Number(i)] || 0} → M{m}
                        </span>
                      ))}
                    {Object.entries(state.moduleStageTargets).map(([i, s]) => (
                      <span key={`module-${i}`}>
                        Module {op ? /-([^:]+):/.exec(plannerModules(op)[Number(i)]?.name || '')?.[1]?.trim() || plannerModules(op)[Number(i)]?.badgeText || '…' : '…'}: Lv.{" "}
                        {(state.startingModuleStages?.[Number(i)] ?? -1) + 1} →{" "}
                        {s + 1}
                      </span>
                    ))}
                  </div>
                  {/* The one way to remove the operator on show that every reader has:
                      the tab's × is a mouse shortcut (aria-hidden, a tab may not hold a
                      button) and Delete needs a keyboard, so a touch screen reader or
                      voice control reaches removal here. It was a 36x44 button of its own
                      beside each tab before the strip became Tabs. Focus goes to All,
                      the tab that takes this panel's place. */}
                  <button
                    type="button"
                    className="ghost btn-sm"
                    onClick={() => {
                      viewHold.capture();
                      onRemove(name);
                      requestAnimationFrame(() => document.getElementById(tabId("planner-operator", ALL_MATERIALS))?.focus({ preventScroll: true }));
                    }}
                  >
                    Remove from plan
                  </button>
                </div>
                {op ? (
                  <SimpleMaterialGroups op={op} state={state} missingShares={missingShares} />
                ) : (
                  <div role="status">
                    {failedNames.has(name)
                      ? "Could not load materials."
                      : "Loading materials…"}{" "}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => onRetry(name)}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </article>
          ) : (
            <section className="simple-all" {...tabPanelProps("planner-operator", ALL_MATERIALS)}>
              <h2 className="section-title">All materials</h2>
              {pending.length ? (
                <p role="status">
                  {pending.some((n) => failedNames.has(n))
                    ? "Could not load materials for"
                    : "Loading"}{" "}
                  {pending.join(", ")}…{" "}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => pending.forEach(onRetry)}
                  >
                    Retry
                  </button>
                </p>
              ) : (
                materialsPanel ?? <Materials cost={combinedBill} />
              )}
            </section>
          )}
          </div>
        </>
      ) : (
        <div className="simple-empty">
          <h2 className="section-title">Who are you building?</h2>
          <p>Search an operator to set their current level and goal.</p>
        </div>
      )}
    </div>
  );
}
