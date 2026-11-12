import OperatorGameIcon from './OperatorGameIcon';

export default function SkillRank({ rank }: { rank: string }) {
  return /^M[123]$/.test(rank)
    ? <OperatorGameIcon src={`/essential-icons/${rank}.webp`} label={`Mastery ${rank.slice(1)}`} size={24} color />
    : <span>{rank}</span>;
}
