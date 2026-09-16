import { ContentImg } from '@/components/content/ContentImage';
import { CSSProperties } from 'react';

/** Existing game artwork, with readable ink in both themes and a named tooltip. */
export default function OperatorGameIcon({ label, src, size = 28, color = false }: {
  label: string; src?: string; size?: number; color?: boolean;
}) {
  const path = src ?? `/essential-icons/${label === 'Base' ? 'Elite 0' : label}.webp`;
  const style: CSSProperties = { width: size, height: size, display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' };
  return color ? (
    // These badges contain blue details as well as the white rank glyph.
    // eslint-disable-next-line @next/next/no-img-element
    <ContentImg src={path} alt={label} title={label} width={size} height={size} style={{ ...style, objectFit: 'contain', background: '#18212a', borderRadius: 4, padding: 3 }} />
  ) : <span role="img" aria-label={label} title={label} style={{ ...style, backgroundColor: 'currentColor', mask: `url("${path}") center / contain no-repeat`, WebkitMask: `url("${path}") center / contain no-repeat` }} />;
}

export const STAT_ICONS: Record<string, string> = {
  hp: 'hp', atk: 'atk', def: 'def', res: 'res', dp: 'cost', block: 'block', interval: 'aspd', redeploy: 'redeploy',
};
