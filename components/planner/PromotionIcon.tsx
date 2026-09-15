import Image from 'next/image';

/** Shared by planner controls and summaries so promotion always uses game art. */
export function PromotionIcon({ elite, size = 22 }: { elite: number; size?: number }) {
  return <Image src={`/essential-icons/Elite%20${elite}.webp`} alt={`Elite ${elite}`} width={size} height={size} className="planner-promotion-icon" />;
}

/** Keep plain state strings for storage/accessibility; render promotion as art. */
export function PlannerStateLabel({ label }: { label: string }) {
  const match = /^E([012])\s*/.exec(label);
  if (!match) return <>{label}</>;
  return <span className="planner-state-label"><PromotionIcon elite={Number(match[1])} size={16} />{label.slice(match[0].length)}</span>;
}
