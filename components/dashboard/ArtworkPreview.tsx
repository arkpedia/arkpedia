import { ContentImg } from '@/components/content/ContentImage';
import type { SponsorArtwork } from '@/lib/sponsors/campaigns';
import styles from './CampaignEditor.module.css';

export default function ArtworkPreview({ art, shape }: { art: SponsorArtwork; shape?: 'header' | 'menu' }) {
  const ratio = art.width / art.height;
  const displayRatio = Number(ratio.toPrecision(4));
  return <figure className={styles.artworkFigure}>
    <ContentImg className={shape === 'header' ? styles.headerPreview : shape === 'menu' ? styles.menuPreview : styles.preview}
      src={art.image} width={art.width} height={art.height} alt={art.alt}
      style={shape === 'menu' ? { width: Math.min(art.width, 60 * ratio) } : undefined} />
    <figcaption className="hint">{art.width} × {art.height} px · {ratio !== displayRatio && '≈ '}{displayRatio} : 1</figcaption>
  </figure>;
}
