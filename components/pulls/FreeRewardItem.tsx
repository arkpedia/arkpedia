import { useId } from 'react';
import { createPortal } from 'react-dom';
import Image from '@/components/content/ContentImage';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import { formatNumber } from '@/lib/pulls/format';
import type { FreeReward } from '@/lib/pulls/freeRewards';

export default function FreeRewardItem({ item, icon }: { item: FreeReward['rewards'][number]; icon?: string }) {
  const id = useId();
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(220);
  const label = `${formatNumber(item.count)} × ${item.name}`;
  if (!icon) return <span className="free-reward-no-art">{label}</span>;
  return <>
    <button type="button" className="btn-bare free-reward-item" ref={buttonRef} aria-label={label} aria-describedby={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }}
      onPointerLeave={() => { if (!buttonRef.current?.matches(':focus-visible')) close(); }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setOpen(true); }} onBlur={close} onClick={() => setOpen(true)}>
      <Image src={icon} width={36} height={36} alt="" /><span>{formatNumber(item.count)}</span>
    </button>
    {open && createPortal(<div ref={menuRef} id={id} role="tooltip" className="free-reward-tooltip" style={menuStyle}>{label}</div>, document.body)}
  </>;
}
