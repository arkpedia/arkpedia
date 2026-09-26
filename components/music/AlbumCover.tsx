import Image from '@/components/content/ContentImage';

/**
 * An album's cover at a fixed square size, or the placeholder while it has none.
 *
 * A new Monster Siren album arrives without a cover: the album sync writes coverFilename only
 * once arkpedia-image-assets has published the file (scripts/sync/sync-albums.mjs), and until
 * then lib/music/albumsData.ts's albumCoverPath is null. `coverPath` is required so every tile
 * and row takes the same path for that case; before, the album tiles drew an empty box and the
 * song rows drew nothing.
 */
export default function AlbumCover({ coverPath, size, className }: { coverPath: string | null; size: number; className: string }) {
  if (coverPath) return <Image src={coverPath} alt="" width={size} height={size} className={className} />;
  return <span className={`${className} music-album-cover-placeholder`} aria-hidden="true">♪</span>;
}
