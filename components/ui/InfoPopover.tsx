import type { ReactNode } from 'react';
import ActionPopover from './ActionPopover';
import InfoIcon from './InfoIcon';

export default function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  return <ActionPopover label={label} trigger={<InfoIcon />} className="info-popover-trigger" width={340}>
    <div className="info-popover-copy" tabIndex={0}>{children}</div>
  </ActionPopover>;
}
