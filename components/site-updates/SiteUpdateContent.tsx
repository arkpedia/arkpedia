import { ContentImg } from '@/components/content/ContentImage';
import type { UpdateContent } from '@/lib/site-updates/types';
import styles from './SiteUpdate.module.css';

export default function SiteUpdateContent({ content, preview = false }: { content: UpdateContent; preview?: boolean }) {
  return <div className={styles.content}>
    {content.body.split(/\n\s*\n/).filter(Boolean).map((part, index) => <p key={index}>{part}</p>)}
    {content.images.map(({ src, alt, device }, index) => {
      if (!src) return null;
      const image = <ContentImg src={src} alt={alt} alreadyPinned />;
      return <figure key={index} data-device={preview ? 'all' : device} className={styles.image}>
        {preview ? image : <a href={src} target="_blank" rel="noreferrer" aria-label={`Open full-size image. ${alt}`}>{image}</a>}
        {preview && device !== 'all' && <figcaption className="hint">{device === 'desktop' ? 'Desktop' : 'Mobile'}</figcaption>}
      </figure>;
    })}
  </div>;
}
