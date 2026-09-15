import { addCostGroup, totalsToCostGroup } from "@/lib/plannerLogic";
import { PromotionIcon } from "./PromotionIcon";
import { useMemo, useState } from "react";
import Image from "next/image";
import type {
  PlannerOperator,
  PlannerOperatorSummary,
  CostGroup,
} from "@/lib/operators/operatorTypes";
import { getOperatorIconPath } from "@/lib/operators/operatorIcon";
import { matchesSearch, searchRelevance } from "@/lib/searchNormalize";
import type { BuilderState } from "@/lib/planner/builderStates";
import { upgradeCostGroups } from "@/lib/planner/upgradeCostGroups";
import { sortMaterials } from "@/lib/farming/materialSortOrder";
import { plannerModules } from "@/lib/planner/build";
import { MaterialIcon } from "./MaterialIcon";

function Materials({ cost }: { cost: CostGroup }) {
  const items = sortMaterials(cost.filter((c) => Number(c.quantity) > 0));
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
    <p className="simple-no-cost">No upgrades selected</p>
  );
}

export function SimpleMaterialGroups({
  op,
  state,
}: {
  op: PlannerOperator;
  state: BuilderState;
}) {
  const [view, setView] = useState<'total' | 'separate'>('total');
  const groups = useMemo(() => upgradeCostGroups(op, state), [op, state]);
  const total = useMemo(() => {
    const quantities = new Map<string, number>();
    groups.forEach(group => addCostGroup(quantities, group.cost));
    return totalsToCostGroup(quantities);
  }, [groups]);
  return (
    <div className="simple-cost-groups">
      <div className="simple-material-view" role="group" aria-label="Material display">
        {(['total', 'separate'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'total' ? 'Total' : 'Separate'}</button>)}
      </div>
      {view === 'total' ? <Materials cost={total} /> : groups.map(g => (
        <section key={g.name}>
          <h3>{g.name}</h3>
          <Materials cost={g.cost} />
        </section>
      ))}
    </div>
  );
}

function Level({ elite, level }: { elite: number; level: number }) {
  return (
    <>
      <PromotionIcon elite={elite} size={26} /> Lv. {level}
    </>
  );
}

export function SimplePlanner({
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
}: {
  clearControl?: React.ReactNode;
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
  onRemove: (name: string) => void;
  onRetry: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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
    <div className="simple-planner">
      <div className="simple-search-row">
      <div
        className="simple-search"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false);
        }}
      >
        <label htmlFor="planner-search" className="visually-hidden">
          Search operators
        </label>
        <input
          id="planner-search"
          type="search"
          placeholder="Search operators…"
          value={query}
          autoComplete="off"
          aria-controls="planner-search-results"
          onFocus={() => setSearchOpen(!!query.trim())}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearchOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              document
                .querySelector<HTMLButtonElement>(
                  "#planner-search-results button",
                )
                ?.focus();
            }
            if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              onEdit(matches[0].name);
              setSearchOpen(false);
              setQuery("");
            }
          }}
        />
        {searchOpen && (
          <div id="planner-search-results" className="simple-search-results">
            {matches.length ? (
              matches.map((o) => (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                    onEdit(o.name);
                  }}
                >
                  <Image
                    src={getOperatorIconPath(o)}
                    alt=""
                    width={42}
                    height={42}
                  />
                  <span>
                    <b>{o.name}</b>
                    <small>
                      {o.rarity}★ {o.className}
                    </small>
                  </span>
                  <span className="simple-search-add">
                    {selectedNames.includes(o.name) ? "Edit" : "+"}
                  </span>
                </button>
              ))
            ) : (
              <p>No operators found</p>
            )}
          </div>
        )}
      </div>
      {clearControl}</div>
      {selectedNames.length > 0 ? (
        <>
          <div
            className="simple-operator-tabs"
            role="group"
            aria-label="View materials for"
          >
            <button
              type="button"
              aria-pressed={!name}
              onClick={() => onSelect(null)}
            >
              All
            </button>
            {selectedNames.map((n) => {
              const o = operators.find((o) => o.name === n);
              return (
                <div key={n} className="simple-operator-tab" data-selected={name === n}>
                  <button
                    type="button"
                    aria-pressed={name === n}
                    onClick={() => onSelect(n)}
                  >
                    {o && (
                      <Image
                        src={getOperatorIconPath(o)}
                        alt=""
                        width={32}
                        height={32}
                      />
                    )}
                    {n}
                  </button>
                  <button
                    type="button"
                    className="simple-operator-remove"
                    aria-label={`Remove ${n} from plan`}
                    title={`Remove ${n} from plan`}
                    onClick={() => onRemove(n)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              );
            })}
          </div>
          {name && summary && state ? (
            <article className="simple-dossier">
              <div className="simple-portrait">
                <Image
                  src={summary.art || getOperatorIconPath(summary)}
                  alt={name}
                  fill
                  sizes="(max-width: 640px) 160px, 300px"
                />
                <div className="simple-portrait-caption">
                  <span>
                    {summary.rarity}★ {summary.className}
                  </span>
                  <h2>{name}</h2>
                </div>
              </div>
              <div className="simple-dossier-content">
                <div className="simple-build-overview">
                  <div className="simple-build-summary">
                    <button type="button" className="simple-state-link" onClick={() => onEdit(name, "current")}>
                      <small>Current Level</small>
                      <b>
                        <Level
                          elite={state.startingElite}
                          level={state.startingLevel}
                        />
                      </b>
                    </button>
                    <span aria-hidden="true">→</span>
                    <button type="button" className="simple-state-link" onClick={() => onEdit(name, "goal")}>
                      <small>Goal</small>
                      <b>
                        <Level elite={state.elite} level={state.level} />
                      </b>
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
                </div>
                {op ? (
                  <SimpleMaterialGroups op={op} state={state} />
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
            <section className="simple-all">
              <h2>All materials</h2>
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
                <Materials cost={combinedBill} />
              )}
            </section>
          )}
        </>
      ) : (
        <div className="simple-empty">
          <h2>Who are you building?</h2>
          <p>Search an operator to set their current level and goal.</p>
        </div>
      )}
    </div>
  );
}
