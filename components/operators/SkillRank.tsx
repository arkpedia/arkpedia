import { ContentImg } from '@/components/content/ContentImage';

export default function SkillRank({ rank }: { rank: string }) {
  return /^M[123]$/.test(rank)
    ? <ContentImg src={`/essential-icons/${rank}.webp`} alt={`Mastery ${rank.slice(1)}`} width={24} height={24} />
    : <span>{rank}</span>;
}
