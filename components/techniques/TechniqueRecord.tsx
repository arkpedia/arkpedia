import Link from 'next/link';
import { useState } from 'react';
import RecordDialog from '@/components/ui/RecordDialog';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import { getClassIconPath } from '@/lib/operators/classBranchIcons';
import { operatorHref } from '@/lib/operators/operatorHref';
import { UMBRELLA_DESCRIPTIONS } from '@/lib/techniques/autoTechniques';
import type { TechniqueEntry, TechniqueGroup } from '@/lib/techniques/buildTechniqueGroups';
import type { TechniqueKind } from '@/lib/techniques/techniqueKinds';
import { useSetting } from '@/lib/settings/siteSettings';
import { OperatorFace } from './OperatorFaces';
import SourceTag from './SourceTag';
import { markTechnique } from './MatchText';

const ROWS = 20;

/**
 * One technique's record over /techniques: what it is, how its umbrella stacks, and every
 * operator who has it -- each with the skill, talent, trait or module it comes from and
 * the words in it that say so. A dialog rather than a fold in the list, so opening and
 * closing it cannot change the page's height under the reader (the Anti-Page Jump rule).
 *
 * `shown` is the operators the page's filters leave; while one is on, a checkbox widens
 * the record to all of them. Operators credited for their whole branch come first, by
 * branch, as the old table view had them: their texts are not what earned them the entry.
 */
export default function TechniqueRecord({ group, kind, shown, filterSummary, branchClasses, onClose }: {
  group: TechniqueGroup;
  kind: TechniqueKind;
  shown: readonly TechniqueEntry[];
  /** "Caster · 6★", or null when no operator filter is on. */
  filterSummary: string | null;
  branchClasses: Record<string, string>;
  onClose: () => void;
}) {
  const [onlyMatching, setOnlyMatching] = useState(true);
  // One setting for every record, remembered (lib/settings/siteSettings.ts).
  const [detailed, setDetailed] = useSetting('techniqueDetail');
  const [rows, setRows] = useState(ROWS);
  const narrowed = filterSummary !== null && onlyMatching;
  const entries = narrowed ? shown : group.entries;
  const byBranch = new Map<string, TechniqueEntry[]>();
  for (const e of entries) if (e.viaBranch) byBranch.set(e.branchName ?? 'Unknown', [...(byBranch.get(e.branchName ?? 'Unknown') ?? []), e]);
  const listed = entries.filter((e) => !e.viaBranch);
  const notes = group.umbrellaNames.filter((u) => UMBRELLA_DESCRIPTIONS[u]);

  return (
    <RecordDialog label={group.name} onClose={onClose} className="technique-record">
      <p className="technique-record-eyebrow">{[kind, ...group.umbrellaNames].join(' · ')}</p>
      <h2 className="entity-title technique-record-title">{group.name}</h2>
      {group.definition && <p className="technique-record-definition">{group.definition}</p>}
      {notes.map((u) => (
        <p key={u} className="technique-record-note"><b>{u}</b> {UMBRELLA_DESCRIPTIONS[u]}</p>
      ))}

      <div className="technique-record-bar">
        <span className="technique-record-count">
          {entries.length} {entries.length === 1 ? 'operator' : 'operators'}{narrowed ? ` of ${group.entries.length}` : ''}
        </span>
        {filterSummary !== null && (
          <label className="check">
            <input type="checkbox" checked={onlyMatching} onChange={(e) => { setOnlyMatching(e.target.checked); setRows(ROWS); }} />
            Only {filterSummary}
          </label>
        )}
        <label className="check technique-record-detail">
          <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
          Detailed Skill Description
        </label>
      </div>

      {byBranch.size > 0 && (
        <section className="technique-record-branches" aria-label="By branch">
          {Array.from(byBranch.entries()).map(([branch, ops]) => (
            <div key={branch} className="technique-record-branch">
              <p className="technique-record-branch-name">
                {ops[0].branchIconPath && <OperatorGameIcon src={ops[0].branchIconPath} label={branch} size={20} />}
                Every {branch}
                <span className="hint">({ops.length})</span>
              </p>
              <ul className="technique-record-branch-ops">
                {ops.map((e) => (
                  <li key={e.operatorName}>
                    <Link prefetch={false} href={operatorHref(e.operatorName, null)} className="technique-record-branch-op">
                      <OperatorFace face={e} size={36} />
                      <span>{e.operatorName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <ul className="technique-rows">
        {listed.slice(0, rows).map((e) => {
          const cls = branchClasses[e.branchName ?? ''];
          const clsIcon = getClassIconPath(cls);
          return (
            <li key={e.operatorName} className="technique-row">
              <Link prefetch={false} href={operatorHref(e.operatorName, null)} className="technique-row-op">
                <OperatorFace face={e} size={48} />
                <span className="technique-row-who">
                  <span className="technique-row-name">{e.operatorName}</span>
                  <span className="technique-row-meta">
                    {e.rarity ? <Rarity n={rarityLevel(e.rarity)} /> : null}
                    {cls && clsIcon && <OperatorGameIcon src={clsIcon} label={cls} size={16} />}
                    {e.branchIconPath && e.branchName && <OperatorGameIcon src={e.branchIconPath} label={e.branchName} size={16} />}
                    <span>{e.branchName}</span>
                  </span>
                  {e.hasM3MainPriority && <span className="technique-row-pick">M3 pick</span>}
                </span>
              </Link>
              <ul className="technique-row-sources">
                {e.badges.map((b, i) => {
                  // The clause that holds the technique, or the whole text: never a summary
                  // in its place (lib/techniques/techniqueExcerpt.ts). Older releases' badges
                  // have no excerpt or note until finalize fills them.
                  const text = detailed ? b.sourceText : (b.excerpt ?? b.sourceText);
                  return (
                    <li key={i} className="technique-source">
                      <SourceTag badge={b} />
                      {text && <p className="technique-source-text">{markTechnique({ ...b, sourceText: text })}</p>}
                      {b.note && <p className="technique-source-note">{b.note}</p>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <LoadOnScroll shown={rows} total={listed.length} onMore={() => setRows((n) => n + ROWS)} />
    </RecordDialog>
  );
}
