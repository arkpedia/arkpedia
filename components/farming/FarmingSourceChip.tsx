import Image from '@/components/content/ContentImage';
import RecordPopover from '@/components/ui/RecordPopover';
import type { FarmingStage } from '@/lib/farming/farmingTypes';
import type { FarmingSource } from '@/lib/farming/farmingSources';

export default function FarmingSourceChip({ stage, source }: { stage: FarmingStage; source?: FarmingSource }) {
  const classes = `farming-stage-chip farming-kind-${stage.kind}`;
  if (!source) return <span className={classes} title={stage.fullLabel || stage.label}>{stage.label}</span>;
  return <RecordPopover label={`${stage.label} — show source`} name={source.name} trigger={stage.label} className={classes}>
    {source.art && <Image src={source.art} alt={source.name} width={640} height={360} className="record-popover-art" />}
  </RecordPopover>;
}
