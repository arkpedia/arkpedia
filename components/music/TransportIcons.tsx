/**
 * The music transport's icons, drawn rather than typed: the glyphs they replace
 * (⏮ ⏸ ▶ ⏭ ⤨ ↻ ☰ ♥) came from whatever font the platform had, at whatever size and
 * baseline it chose -- iOS drew ⏸ as a colour emoji. One 20px grid, currentColor, so
 * each takes the colour of the button it sits in (teal when that button is on).
 */
type IconName = 'prev' | 'play' | 'pause' | 'next' | 'shuffle' | 'repeat' | 'list' | 'heart' | 'plus' | 'streamSafe' | 'close' | 'note' | 'loading';

const PATHS: Record<IconName, JSX.Element> = {
  prev: <><path d="M5 4v12" strokeWidth="1.8" /><path d="M15.5 4.5 7.5 10l8 5.5z" fill="currentColor" stroke="none" /></>,
  play: <path d="M6.5 4.2 16 10l-9.5 5.8z" fill="currentColor" stroke="none" />,
  pause: <><rect x="5" y="4" width="3.4" height="12" fill="currentColor" stroke="none" /><rect x="11.6" y="4" width="3.4" height="12" fill="currentColor" stroke="none" /></>,
  next: <><path d="M15 4v12" strokeWidth="1.8" /><path d="M4.5 4.5 12.5 10l-8 5.5z" fill="currentColor" stroke="none" /></>,
  shuffle: <><path d="M3 6h3.2c1.6 0 2.6.8 3.5 2.2l1.6 3.6c.9 1.4 1.9 2.2 3.5 2.2H17" /><path d="M3 14h3.2c1.2 0 2-.4 2.7-1.2M11.1 7.2c.7-.8 1.5-1.2 2.7-1.2H17" /><path d="m14.5 3.5 2.5 2.5-2.5 2.5M14.5 11.5l2.5 2.5-2.5 2.5" /></>,
  repeat: <><path d="M4 9V7.5A2.5 2.5 0 0 1 6.5 5H15" /><path d="m12.5 2.5 2.5 2.5-2.5 2.5" /><path d="M16 11v1.5a2.5 2.5 0 0 1-2.5 2.5H5" /><path d="m7.5 17.5-2.5-2.5 2.5-2.5" /></>,
  list: <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />,
  heart: <path d="M10 16.3s-6-3.6-6-8A3.3 3.3 0 0 1 10 6.4a3.3 3.3 0 0 1 6 1.9c0 4.4-6 8-6 8z" />,
  plus: <path d="M10 4v12M4 10h12" />,
  streamSafe: <><circle cx="10" cy="10" r="6.5" /><path d="M12.4 8.1a2.8 2.8 0 1 0 0 3.8" /></>,
  close: <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />,
  note: <><path d="M8 14.5V4.5l8-1.5v10" /><circle cx="6" cy="14.5" r="2" fill="currentColor" stroke="none" /><circle cx="14" cy="13" r="2" fill="currentColor" stroke="none" /></>,
  loading: <><circle cx="5" cy="10" r="1.4" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1.4" fill="currentColor" stroke="none" /></>,
};

export default function TransportIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
