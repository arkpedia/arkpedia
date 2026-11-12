import Image from '@/components/content/ContentImage';
import { formatNumber } from '@/lib/pulls/format';

const resources = {
  sanity: { name: 'Sanity', unit: 'Sanity', path: '/stat-icons/sanity.webp' },
  op: { name: 'Originite Prime', unit: 'OP', path: '/material-icons/Originite%20Prime.webp' },
  permits: { name: 'Headhunting Permit', unit: 'permits', path: '/material-icons/Headhunting%20Permit.webp' },
  pulls: { name: 'Pulls', unit: 'pulls', path: '/material-icons/Headhunting%20Permit.webp' },
  orundum: { name: 'Orundum', unit: 'Orundum', path: '/material-icons/Orundum.webp' },
};

export function RewardAmount({ resource, amount, iconOnly = false }: { iconOnly?: boolean; resource: keyof typeof resources; amount: number }) {
  const item = resources[resource];
  return <span className="pulls-reward-amount" title={item.name}>
    <Image src={item.path} width={24} height={24} alt="" />
    <span>{formatNumber(amount)} <small className={iconOnly ? 'visually-hidden' : undefined}>{item.unit}</small></span>
  </span>;
}
