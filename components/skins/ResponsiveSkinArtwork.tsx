import { useContentUrl } from '@/lib/content/context';
import { ContentImg } from '@/components/content/ContentImage';
/* eslint-disable @next/next/no-img-element -- picture sources are prebuilt in the asset repository. */
import { CSSProperties, MouseEventHandler } from 'react';
import { getSkinArtworkSources } from '@/lib/assets/skinArtwork';

interface Props {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  onClick?: MouseEventHandler<HTMLImageElement>;
}

/**
 * Serves small AVIF/WebP artwork in normal UI and leaves the lossless PNG for
 * the explicit zoom view. Media queries avoid claiming a 1280px intrinsic size
 * for portraits whose public original is smaller than that.
 */
export default function ResponsiveSkinArtwork({
  src, alt, className, style, width, height, fill = false, priority = false, sizes = '100vw', onClick,
}: Props) {
  const url = useContentUrl();
  const sources = getSkinArtworkSources(src);
  const imageStyle: CSSProperties = fill
    ? { ...style, position: 'absolute', inset: 0, width: '100%', height: '100%' }
    : style ?? {};

  if (!sources) {
    return <ContentImg src={src} alt={alt} className={className} style={imageStyle} width={width} height={height}
      loading={priority ? 'eager' : 'lazy'} onClick={onClick} />;
  }

  return (
    <picture>
      <source type="image/avif" sizes={sizes}
        srcSet={`${url(sources.avif[320])} 320w, ${url(sources.avif[768])} 768w, ${url(sources.avif[1280])} 1280w`} />
      <source type="image/webp" sizes={sizes}
        srcSet={`${url(sources.webp[320])} 320w, ${url(sources.webp[768])} 768w, ${url(sources.webp[1280])} 1280w`} />
      <ContentImg src={sources.fallback} alt={alt} className={className} style={imageStyle} width={width} height={height}
        loading={priority ? 'eager' : 'lazy'} decoding="async" onClick={onClick} />
    </picture>
  );
}
