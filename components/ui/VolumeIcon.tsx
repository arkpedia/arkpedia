export default function VolumeIcon({ muted, size = 20 }: { muted: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8h3l4-3.5v11L6 12H3z" />
    <path d={muted ? 'm13 7 5 6m0-6-5 6' : 'M13 7a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10'} />
  </svg>;
}
