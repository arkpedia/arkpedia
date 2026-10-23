import Image from '@/components/content/ContentImage';
import { rarityLevel } from '@/components/ui/Rarity';

export interface Face {
  operatorName: string;
  operatorIconPath: string;
  rarity: number | null;
}

/** An operator's portrait at a glance: the art over its rarity's edge (.tier-N). */
export function OperatorFace({ face, size }: { face: Face; size: number }) {
  return (
    <span className={`technique-face${face.rarity ? ` tier-${rarityLevel(face.rarity)}` : ''}`} style={{ width: size, height: size }} title={face.operatorName}>
      <Image src={face.operatorIconPath} alt="" width={size} height={size} />
    </span>
  );
}

/**
 * The first few portraits of a list and how many more there are: a technique's or a
 * synergy's operators on its card. Decoration for a card whose own text names it, so the
 * portraits are hidden from screen readers (their names are in the record it opens).
 */
export default function OperatorFaces({ faces, max, size = 32 }: { faces: readonly Face[]; max: number; size?: number }) {
  const shown = faces.length > max ? faces.slice(0, max - 1) : faces;
  const more = faces.length - shown.length;
  return (
    <span className="technique-faces" aria-hidden="true">
      {shown.map((face) => <OperatorFace key={face.operatorName} face={face} size={size} />)}
      {more > 0 && <span className="technique-faces-more" style={{ height: size, minWidth: size }}>+{more}</span>}
    </span>
  );
}
