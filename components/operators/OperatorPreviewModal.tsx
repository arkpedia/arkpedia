import { createPortal } from 'react-dom';
import { OperatorPreview, type OperatorPreviewItem } from './OperatorPreview';

export type { OperatorPreviewItem };

/* The /gacha and home-page operator preview: OperatorPreview rendered at body level.
   Both callers sit inside page panels, so the overlay is portalled out to keep it above
   everything (a fixed overlay inside a panel's stacking context would clip). Every piece
   of behaviour lives in OperatorPreview; this file only places it. */
export default function OperatorPreviewModal({ item, onClose }: { item: OperatorPreviewItem; onClose: () => void }) {
  return createPortal(<OperatorPreview item={item} onClose={onClose} />, document.body);
}
