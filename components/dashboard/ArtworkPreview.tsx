import { ContentImg } from '@/components/content/ContentImage';
import type { SponsorArtwork } from '@/lib/sponsors/campaigns';
import styles from './CampaignEditor.module.css';

export default function ArtworkPreview({ art, shape }: { art: SponsorArtwork; shape?: 'header' | 'menu' }) {
  return <ContentImg className={shape === 'header' ? styles.headerPreview : shape === 'menu' ? styles.menuPreview : styles.preview}
    src={art.image} width={art.width} height={art.height} alt={art.alt}
    style={shape === 'menu' ? { width: Math.min(art.width, 60 * art.width / art.height) } : undefined} />;
}
