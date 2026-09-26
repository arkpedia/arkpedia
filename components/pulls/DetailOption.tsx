import type { SelectOption } from '@/components/ui/StyledSelect';
import { ContentImg } from '@/components/content/ContentImage';

/** A /pulls dropdown row: a label, an optional caption line (banner name, dates) and,
 *  for a banner, the rate-up portraits. The row itself -- its height, hover, selection
 *  and check mark -- is StyledSelect's; this only fills it. */
export type DetailOption = SelectOption & {
  detail?: string;
  meta?: string;
  portraits?: { name: string; src: string }[];
};

export function DetailOptionContent({ option, compact = false }: { option: DetailOption; compact?: boolean }) {
  const portraits = option.portraits ?? [];
  return <span className="pulls-select-content">
    {portraits.length > 0 && <span className="pulls-select-portraits" aria-hidden="true">{portraits.map(portrait => (
      // eslint-disable-next-line @next/next/no-img-element
      <ContentImg key={portrait.name} src={portrait.src} alt="" title={portrait.name} width={compact ? 32 : 40} height={compact ? 32 : 40} />
    ))}</span>}
    <span className={portraits.length > 0 ? 'visually-hidden' : 'pulls-select-label'}>{option.label}</span>
    {!compact && option.detail && <small className="pulls-select-caption"><span>{option.detail}</span>{option.meta && <span className="pulls-select-meta">{option.meta}</span>}</small>}
  </span>;
}
