import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { alphaBox, type ArtworkBox } from '@/lib/skins/artworkFraming';

const measured = new Map<string, ArtworkBox | null>();
/** Fit visible artwork rather than the publisher's transparent canvas padding. */
export default function PreviewArtwork({ src, alt }: { src: string; alt: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState<{ src: string; width: number; height: number; box: ArtworkBox | null } | null>(null);
  useEffect(() => {
    const element = frame.current; if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const loaded = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget, url = img.currentSrc;
    if (!measured.has(url)) {
      try {
        const canvas = document.createElement('canvas'), scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        measured.set(url, alphaBox(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
      } catch { measured.set(url, null); }
    }
    setImage({ src, width: img.naturalWidth, height: img.naturalHeight, box: measured.get(url) ?? null });
  };
  const box = image?.src === src ? image.box : null;
  let style: CSSProperties | undefined;
  if (image && box && size.width && size.height) {
    const scale = .94 * Math.min(size.width / (box.width * image.width), size.height / (box.height * image.height));
    style = { width: image.width * scale, height: image.height * scale,
      left: (size.width - box.width * image.width * scale) / 2 - box.x * image.width * scale,
      top: (size.height - box.height * image.height * scale) / 2 - (1 - box.y - box.height) * image.height * scale };
  }
  return <div ref={frame} className="gacha-pull-preview-art" data-art-framed={!!style}>
    <ContentImg key={src} src={src} alt={alt} crossOrigin="anonymous" className="gacha-preview-art-image" style={style} onLoad={loaded} />
  </div>;
}
