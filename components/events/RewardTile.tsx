import { RewardClick } from './RewardDetails';
import Image from '@/components/content/ContentImage';

/**
 * One reward as a tile: its icon, its name and how many. The All row's totals (RewardTotalsRow on
 * /events/[slug]) and a pack's contents (EventPacks) both draw it, so a change to the tile is made
 * once; .event-reward-total in styles/schedule/events.css.
 */
export function RewardTile({ name, iconPath, count }: { name: string; iconPath: string | null; count: number }) {
  return (
    <RewardClick name={name} className="panel event-reward-total">
      {/* No icon published yet: the frame holds its place. */}
      <span className="event-reward-total-icon">{iconPath && <Image src={iconPath} alt="" width={40} height={40} />}</span>
      {/* The name on the tile, not only in a tooltip a phone cannot reach. */}
      <span className="event-reward-total-name">{name}</span>
      <b>×{count.toLocaleString('en-US')}</b>
    </RewardClick>
  );
}
