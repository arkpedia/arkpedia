import { useContentUrl } from '@/lib/content/context';
import { ContentImg } from '@/components/content/ContentImage';
import { getEssentialIconPath } from '@/lib/operators/operatorIconPaths';
import { CSSProperties, useRef } from 'react';
import { useAssetUrl } from '@/lib/assets/assetRetry';

/** Existing game artwork, with readable ink in both themes and a named tooltip. */
export default function OperatorGameIcon({ label, src, size = 28, color = false }: {
  label: string; src?: string; size?: number; color?: boolean;
}) {
  const url = useContentUrl();
  const path = url(src ?? getEssentialIconPath(label) ?? '');
  // A mask has no error event: a false 404 is looked at once it is shown (lib/assets/assetRetry.ts).
  const maskRef = useRef<HTMLSpanElement>(null);
  const mask = useAssetUrl(path, maskRef);
  const style: CSSProperties = { width: size, height: size, display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' };
  return color ? (
    // These badges contain blue details as well as the white rank glyph.
    // eslint-disable-next-line @next/next/no-img-element
    <ContentImg src={path} alt={label} title={label} width={size} height={size} style={{ ...style, objectFit: 'contain', background: '#18212a', borderRadius: 4, padding: 3 }} />
  ) : <span ref={maskRef} role="img" aria-label={label} title={label} style={{ ...style, backgroundColor: 'currentColor', mask: `url("${mask}") center / contain no-repeat`, WebkitMask: `url("${mask}") center / contain no-repeat` }} />;
}

export const STAT_ICONS: Record<string, string> = {
  hp: 'hp', atk: 'atk', def: 'def', res: 'res', dp: 'cost', block: 'block', interval: 'aspd', redeploy: 'redeploy',
};
