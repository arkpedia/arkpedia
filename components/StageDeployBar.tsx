import Image from 'next/image';
import { useMemo, useState } from 'react';
import { getClassIconPath } from '@/lib/operators/classBranchIcons';

/**
 * The squad bar the game puts under a battle, for putting an operator on a tile and
 * seeing the ground it covers.
 *
 * Data is public/operator-deploy.json, written by scripts/build-operator-deploy.mjs and
 * fetched when the bar first opens rather than bundled -- see that script for why.
 *
 * Only ranges for now. Nothing here deploys anything in the sense the game means: no
 * combat, no DP spent, no blocking. It answers "what would this operator cover from
 * there", which is the question a map is usually open for.
 */
export interface DeployPhase {
  cost: number | null;
  range: string;
}
export interface DeployOperator {
  id: string;
  name: string;
  rarity: number;
  cls: string;
  /** Resolved against the files on disk at build time -- see the build script for the
   *  two reasons deriving it from the name does not work. Null if there is no art. */
  icon: string | null;
  /** melee stands on ground, ranged on high ground -- the game's own rule. */
  reach: 'melee' | 'ranged';
  phases: DeployPhase[];
  /** Folded name plus alter aliases; see the build script. */
  q: string;
}
export interface DeployData {
  ranges: Record<string, [number, number][]>;
  operators: DeployOperator[];
}

/** Which promotion the bar is set to. Index into an operator's phases. */
export const ELITE_LABELS = ['E0', 'E1', 'E2'];

/** The phase an operator is at for the chosen elite, clamped to what it HAS. */
export function phaseAt(op: DeployOperator, elite: number): DeployPhase {
  return op.phases[Math.min(elite, op.phases.length - 1)];
}

/**
 * Every whitespace-separated word of the query has to appear somewhere in the
 * operator's folded terms. Word-wise rather than whole-string, so "chen alter" matches
 * a term list holding both -- and so word order does not matter.
 */
export function matchOperators(operators: DeployOperator[], query: string): DeployOperator[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return operators;
  return operators.filter((op) => words.every((word) => op.q.includes(word)));
}

export default function StageDeployBar({
  data,
  elite,
  onElite,
  armed,
  onArm,
  placedCount,
  onClear,
  onDragStart,
}: {
  data: DeployData | null;
  elite: number;
  onElite: (elite: number) => void;
  armed: DeployOperator | null;
  onArm: (op: DeployOperator | null) => void;
  placedCount: number;
  onClear: () => void;
  onDragStart: (op: DeployOperator, x: number, y: number) => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => matchOperators(data?.operators || [], query), [data, query]);

  return (
    <div className="stage-deploy">
      {/* Left, because it changes what every tile in the strip means: promotion moves
          both the DP cost and the range. */}
      <div className="stage-deploy-elite" role="group" aria-label="Promotion">
        {ELITE_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`stage-deploy-elite-btn${elite === i ? ' current' : ''}`}
            aria-pressed={elite === i}
            onClick={() => onElite(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        className="stage-search stage-deploy-search"
        placeholder="wisadel, chen alter, pozemka..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search operators"
      />
      <div className="stage-deploy-strip" role="listbox" aria-label="Operators">
        {!data && <span className="stage-deploy-note">loading operators...</span>}
        {data && !shown.length && <span className="stage-deploy-note">no operator matches that</span>}
        {shown.map((op) => (
          <OperatorTile
            key={op.id}
            op={op}
            elite={elite}
            armed={armed?.id === op.id}
            onArm={() => onArm(armed?.id === op.id ? null : op)}
            onDragStart={onDragStart}
          />
        ))}
      </div>
      {/* Rendered always and hidden when there is nothing to clear: taking it out of
          the layout would widen the strip and slide every operator in it sideways the
          moment the first one was placed. */}
      <button
        type="button"
        className="ghost stage-deploy-clear"
        onClick={onClear}
        hidden={placedCount === 0}
        aria-hidden={placedCount === 0}
        tabIndex={placedCount === 0 ? -1 : undefined}
      >
        Clear {placedCount || ''}
      </button>
    </div>
  );
}

function OperatorTile({
  op,
  elite,
  armed,
  onArm,
  onDragStart,
}: {
  op: DeployOperator;
  elite: number;
  armed: boolean;
  onArm: () => void;
  onDragStart: (op: DeployOperator, x: number, y: number) => void;
}) {
  const phase = phaseAt(op, elite);
  const classIcon = getClassIconPath(op.cls);
  return (
    <button
      type="button"
      className={`stage-deploy-op r${op.rarity}${armed ? ' armed' : ''}`}
      aria-pressed={armed}
      /* Press and drag to the map, the way the game does it. The click below stays --
         it is the same journey for a keyboard, which cannot drag anything. */
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        // Stops the browser starting its OWN drag of the portrait, which takes the
        // pointer away: pointermove goes quiet and the pointerup never arrives.
        e.preventDefault();
        onDragStart(op, e.clientX, e.clientY);
      }}
      onClick={onArm}
      title={`${op.name} -- ${op.cls}, ${phase.cost} DP at ${ELITE_LABELS[Math.min(elite, op.phases.length - 1)]}`}
    >
      {/* unoptimized: these names carry apostrophes and diacritics the image optimizer
          rejects outright, and a 44px thumbnail of an already-webp 14 kB file has
          nothing to gain from a transformation. */}
      {op.icon ? (
        <Image className="stage-deploy-op-art" src={op.icon} alt="" width={64} height={64} unoptimized draggable={false} />
      ) : (
        <span className="stage-deploy-op-art stage-deploy-op-noart" />
      )}
      {classIcon && (
        <Image className="stage-deploy-op-class" src={classIcon} alt="" width={12} height={12} unoptimized />
      )}
      {phase.cost != null && <span className="stage-deploy-op-cost">{phase.cost}</span>}
      <span className="stage-deploy-op-name">{op.name}</span>
    </button>
  );
}
