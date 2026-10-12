import Image from '@/components/content/ContentImage';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { BaseOperator } from '@/lib/operators/operatorTypes';
import type { BaseAssignments, FacilityDef } from '@/lib/base/baseTypes';
import { PRODUCTION_SPOTS } from '@/lib/base/baseConfig';
import BaseMap from './BaseMap';

export interface BaseRoomSummary { id: string; metric: string; detail: string; deadline?: number | null; workers: { name: string; morale: number | null; rate: number | null }[] }
export default function BaseOverview({ facilities, assignments, operators, summaries, selected, onSelect, readOnly = false, loginInterval = 12 }: {
  facilities: FacilityDef[]; assignments: BaseAssignments; operators: BaseOperator[]; summaries: BaseRoomSummary[];
  selected: string | null; onSelect: (id: string) => void; readOnly?: boolean; loginInterval?: number;
}) {
  const byName = new Map(operators.map(op => [op.name, op]));
  return <BaseMap><div className="base-overview" aria-label="Base facilities">
    <span className="base-overview-elevator" style={{ gridArea: 'elevA' }} aria-hidden="true" />
    <span className="base-overview-elevator" style={{ gridArea: 'elevC' }} aria-hidden="true" />
    {facilities.filter(f => f.kind !== 'elevator').map(f => {
      const slots = assignments[f.id] ?? [], summary = summaries.find(s => s.id === f.id), spot = PRODUCTION_SPOTS.find(s => s.id === f.id);
      const position = spot ? `B${spot.row}0${spot.column}` : f.kind === 'dormitory' ? `Dorm ${f.id.slice(-1)}` : '';
      return <button key={f.id} type="button" className={`btn-bare base-overview-room base-overview-${f.kind}`} style={{ gridArea: f.gridArea }} aria-pressed={selected === f.id} aria-label={`${position ? `${position} ` : ''}${f.label}, level ${f.level}, ${slots.filter(Boolean).length} of ${f.capacity} operators`} onClick={() => onSelect(f.id)}>
        <span className="base-overview-room-head"><span>{position || f.label}</span><span>{f.level ? `Lv${f.level}` : 'Unbuilt'}</span></span>
        {position && <strong className="base-overview-room-name">{f.label}</strong>}
        <span className="base-overview-staff">
          {slots.map((slot, index) => {
            const op = slot && byName.get(slot.operatorName);
            return <span key={index} className="base-overview-slot" title={slot?.operatorName ?? 'Empty slot'}>{op ? <Image src={getOperatorIconPath(op)} alt={op.name} width={36} height={36} /> : <span aria-hidden="true">+</span>}</span>;
          })}
          {!f.capacity && <span className="hint">{readOnly ? 'Not built' : 'Build this room'}</span>}
        </span>
        <span className="base-overview-result">{summary?.metric || (f.level ? 'No operators' : '')}</span>
        <span className="base-overview-detail">{summary?.detail || '\u00a0'}</span>
        {summary?.deadline != null && <span className={`base-overview-deadline${summary.deadline < loginInterval ? ' prod-danger' : ''}`}>{summary.deadline.toFixed(1)}h until tired</span>}
      </button>;
    })}
  </div></BaseMap>;
}
