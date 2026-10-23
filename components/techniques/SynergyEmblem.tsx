import { ContentArt } from '@/components/content/ContentImage';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import { getClassIconPath } from '@/lib/operators/classBranchIcons';
import type { SynergyGroup } from '@/lib/techniques/buildSynergyGroups';

/** A faction's emblem or a class's glyph: white art, drawn as a mask in the ink around it
 *  so it reads in both themes. A faction with no emblem on file shows its initial. */
export default function SynergyEmblem({ group, emblem, size }: { group: Pick<SynergyGroup, 'name' | 'type'>; emblem: string | null; size: number }) {
  const icon = group.type === 'class' ? getClassIconPath(group.name) : null;
  return (
    <span className="synergy-emblem" style={{ width: size, height: size }} aria-hidden="true">
      {icon ? <OperatorGameIcon src={icon} label={group.name} size={Math.round(size * 0.7)} />
        : emblem ? <ContentArt className="synergy-emblem-art" src={emblem} />
          : <span className="synergy-emblem-initial">{group.name.slice(0, 1)}</span>}
    </span>
  );
}
