import OperatorGameIcon from './OperatorGameIcon';
import { highlightStats } from '../ui/HighlightedText';

const icons: Record<string, string> = {
  hp: 'hp', 'max hp': 'hp', atk: 'atk', def: 'def', res: 'res',
  'dp cost': 'cost', 'redeployment time': 'redeploy', 'attack speed': 'aspd',
};

/** Replace labels in stat lists, while preserving the full upgrade wording and units. */
export default function OperatorStatModifiers({ text }: { text: string | null | undefined }) {
  return <>{(text ?? '').split(/(\b(?:Elite [012]|E[012]|Max HP|HP|ATK|DEF|RES|DP cost|Redeployment time|Attack speed)\b)/gi).map((part, index) => {
    const elite = /^(?:Elite |E)([012])$/i.exec(part);
    if (elite) return <OperatorGameIcon key={index} label={`Elite ${elite[1]}`} size={24} />;
    const icon = icons[part.toLowerCase()];
    return icon ? <OperatorGameIcon key={index} label={part} src={`/stat-icons/${icon}.webp`} size={22} /> : <span key={index}>{highlightStats(part)}</span>;
  })}</>;
}
