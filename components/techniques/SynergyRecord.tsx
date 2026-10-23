import Link from 'next/link';
import { useState } from 'react';
import RecordDialog from '@/components/ui/RecordDialog';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { operatorHref } from '@/lib/operators/operatorHref';
import type { SynergyGroup } from '@/lib/techniques/buildSynergyGroups';
import { synergyBuffs, synergyForSelf } from '@/lib/techniques/synergyBuffs';
import { OperatorFace } from './OperatorFaces';
import SourceTag from './SourceTag';
import { markSynergyKeyword } from './MatchText';
import SynergyEmblem from './SynergyEmblem';

const MEMBERS = 30;

/**
 * One faction's or class's record over /synergies: who grants it what, in their own words,
 * and the operators it reaches. A dialog, so opening and closing it never changes the
 * page's height (the Anti-Page Jump rule); the member list grows as it is read.
 */
/** One contributor per row, each source with its buffs and its words. A source that only makes
 *  the contributor stronger with the group (synergyForSelf) says so in place of the group's buffs. */
function GiverRows({ givers }: { givers: SynergyGroup['entries'] }) {
  return (
    <ul className="technique-rows">
      {givers.map((e) => (
        <li key={e.operatorName} className="technique-row">
          <Link prefetch={false} href={operatorHref(e.operatorName, null)} className="technique-row-op">
            <OperatorFace face={e} size={48} />
            <span className="technique-row-who">
              <span className="technique-row-name">{e.operatorName}</span>
              <span className="technique-row-meta">{e.rarity ? <Rarity n={rarityLevel(e.rarity)} /> : null}</span>
            </span>
          </Link>
          <ul className="technique-row-sources">
            {e.badges.map((b, i) => {
              const forSelf = synergyForSelf(b.sourceText, b.matchedKeyword, e.operatorName);
              return (
                <li key={i} className="technique-source">
                  <span className="synergy-source-head">
                    <SourceTag badge={b} />
                    <span className="synergy-buffs">
                      {forSelf && <span className="synergy-buff synergy-buff-self">For {e.operatorName}</span>}
                      {synergyBuffs(b.sourceText, b.matchedKeyword).map((t) => <span key={t} className="synergy-buff">{t}</span>)}
                    </span>
                  </span>
                  {b.sourceText && <p className="technique-source-text">{markSynergyKeyword(b.sourceText, b.matchedKeyword)}</p>}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default function SynergyRecord({ group, emblem, onClose }: { group: SynergyGroup; emblem: string | null; onClose: () => void }) {
  const [members, setMembers] = useState(MEMBERS);
  const contributors = group.entries.filter((e) => e.isContributor);
  const grantsSomething = (e: SynergyGroup['entries'][number]) => e.badges.some((b) => !synergyForSelf(b.sourceText, b.matchedKeyword, e.operatorName));
  const givers = contributors.filter(grantsSomething);
  const withers = contributors.filter((e) => !grantsSomething(e));
  const others = group.entries.filter((e) => !e.isContributor);
  const kind = group.type === 'class' ? 'Class' : 'Faction';
  const them = group.type === 'class' ? `${group.name}s` : group.name;

  return (
    <RecordDialog label={`${group.name} synergies`} onClose={onClose} className="technique-record">
      <div className="synergy-record-head">
        <SynergyEmblem group={group} emblem={emblem} size={48} />
        <div>
          <p className="technique-record-eyebrow">{kind}</p>
          <h2 className="entity-title technique-record-title">{group.name}</h2>
        </div>
      </div>
      <p className="technique-record-definition">
        {givers.length > 0 && <>{givers.length} {givers.length === 1 ? 'operator buffs' : 'operators buff'} {them}{others.length > 0 ? `; the buffs reach ${others.length} more ${group.name} operator${others.length === 1 ? '' : 's'}` : ''}. </>}
        {withers.length > 0 && <>{withers.length} {withers.length === 1 ? 'operator gets' : 'operators get'} stronger with {them} on the team.</>}
      </p>

      {givers.length > 0 && <><h3 className="technique-record-section">Granted by</h3><GiverRows givers={givers} /></>}
      {withers.length > 0 && <><h3 className="technique-record-section">Stronger with {them}</h3><GiverRows givers={withers} /></>}

      {others.length > 0 && (
        <>
          <h3 className="technique-record-section">Also {group.type === 'class' ? `every other ${group.name}` : `in ${group.name}`} <span className="hint">({others.length})</span></h3>
          <ul className="synergy-members">
            {others.slice(0, members).map((e) => (
              <li key={e.operatorName}>
                <Link prefetch={false} href={operatorHref(e.operatorName, null)} className="technique-record-branch-op">
                  <OperatorFace face={e} size={36} />
                  <span>{e.operatorName}</span>
                </Link>
              </li>
            ))}
          </ul>
          <LoadOnScroll shown={members} total={others.length} onMore={() => setMembers((n) => n + MEMBERS)} />
        </>
      )}
    </RecordDialog>
  );
}
