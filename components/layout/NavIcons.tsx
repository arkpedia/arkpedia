import type { JSX } from 'react';
import { ContentArt } from '@/components/content/ContentImage';

/**
 * A game icon drawn in the current text colour.
 *
 * The art is a white-on-alpha bitmap, so it goes in as a CSS mask over currentColor
 * rather than as an <ContentImg>. An <ContentImg> would stay white on the light theme and ignore the
 * teal an active entry picks up, which is the whole reason the site draws them this way
 * (see .site-nav-glyph in nav.css).
 */
const glyph = (src: string): JSX.Element => (
  <ContentArt className="site-nav-glyph" src={src} />
);

export const ICONS: Record<string, JSX.Element> = {
  projects: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg>,
  world: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" /></svg>,
  about: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg>,
  privacy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z" /><path d="m8 12 3 3 5-6" /></svg>,
  cookies: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 12a9 9 0 1 1-9-9 5 5 0 0 0 9 9Z" /><path d="M8 8h.01M7 14h.01M12 17h.01M13 11h.01" strokeWidth="3" strokeLinecap="round" /></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg>,
  friends: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="4" /><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8m1 3a6 6 0 0 1 4 6" /></svg>,
  history: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" /></svg>,
  transfer: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" /></svg>,
  synergies: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></svg>,
  techniques: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" /></svg>,
  obtain: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m3 10 9 5 9-5-9-5-9 5Zm0 0v9l9 4 9-4v-9M12 15v8M12 1v9m-3-3 3 3 3-3" /></svg>,
  rate: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  /* The in-game Operator archive glyph. */
  roster: glyph('/essential-icons/Operators.webp'),
  microphone: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="7" y="2" width="6" height="10" rx="3" />
      <path d="M4.5 9.5V10a5.5 5.5 0 0 0 11 0v-.5M10 15.5V18M7 18h6" strokeLinecap="round" />
    </svg>
  ),
  palette: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2a8 8 0 1 0 0 16h1a2 2 0 0 0 1.6-3.2 1.5 1.5 0 0 1 1.2-2.4H15a3 3 0 0 0 3-3C18 5.3 14.4 2 10 2Z" strokeLinejoin="round" />
      <g fill="currentColor" stroke="none">
        <circle cx="5.5" cy="9" r="1" />
        <circle cx="7.5" cy="5.5" r="1" />
        <circle cx="12" cy="5.5" r="1" />
        <circle cx="15" cy="8.5" r="1" />
      </g>
    </svg>
  ),
  theme: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2 L17 7 L14.5 16 L5.5 16 L3 7 Z" strokeLinejoin="round" />
      <path d="M10 2 L10 16 M3 7 L17 7" strokeLinejoin="round" />
    </svg>
  ),
  community: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M8.5 8 L12.5 10 L8.5 12 Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  gacha: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 5h18v4a3 3 0 0 0 0 6v4H3v-4a3 3 0 0 0 0-6V5Z" /><path d="M16 5v3m0 3v2m0 3v3M6 9h6m-6 3h4m-4 3h6" /></svg>,
  selector: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 4h18v5a3 3 0 0 0 0 6v5H3v-5a3 3 0 0 0 0-6V4Z" /><path d="m9 8 1.2 2.5 2.8.4-2 2 .5 2.8L9 14.4l-2.5 1.3.5-2.8-2-2 2.8-.4L9 8Zm7-4v4m0 3v2m0 3v4" /></svg>,
  recruitment: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 17 C2.5 12.5 5 11 8 11 C11 11 13.5 12.5 13.5 17" strokeLinecap="round" />
      <path d="M14.5 4.5 L16.5 6.5 L14.5 8.5 M17 6.5 H12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  guesser: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <path d="M7.5 7.5 C7.5 5.8 8.6 4.8 10 4.8 C11.4 4.8 12.5 5.8 12.5 7.2 C12.5 8.8 10 9 10 11.5" strokeLinecap="round" />
      <circle cx="10" cy="14.3" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  timeline: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4" width="15" height="13" rx="1.5" />
      <path d="M2.5 8 H17.5 M6 2.5 V5.5 M14 2.5 V5.5" strokeLinecap="round" />
    </svg>
  ),
  skins: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 3 L4 6 L4 17 H16 L16 6 L13 3" strokeLinejoin="round" />
      <path d="M7 3 C7 5 8.5 6 10 6 C11.5 6 13 5 13 3" strokeLinejoin="round" />
    </svg>
  ),
  events: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <path d="M3 8H17" strokeLinecap="round" />
      <path d="M6.5 2.5V5.5M13.5 2.5V5.5" strokeLinecap="round" />
    </svg>
  ),
  farming: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 17 V9 M10 9 C10 6 7 6 6 3.5 C9 3.5 10 6 10 8 C10 6 11 3.5 14 3.5 C13 6 10 6 10 9 Z" strokeLinejoin="round" />
    </svg>
  ),
  /* The in-game Terminal glyph. */
  stages: glyph('/essential-icons/Stages.webp'),
  /* The four-square grid that used to stand for Stages -- kept for Game Modes,
     which shared the 'stages' key and should keep looking the way it did. */
  grid: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
    </svg>
  ),
  enemies: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8.5C3 5 6 3 10 3s7 2 7 5.5c0 2.2-.9 3.6-2 4.6V16l-2-1.2L10.5 16 8 14.8 6 16v-2.9C4.9 12.1 3 10.7 3 8.5Z" strokeLinejoin="round" />
      <path d="M7.5 8.5 9 9.7M12.5 8.5 11 9.7" strokeLinecap="round" />
    </svg>
  ),
  // A sparkle: What's new.
  changelog: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5 11.6 8.4 17.5 10 11.6 11.6 10 17.5 8.4 11.6 2.5 10 8.4 8.4Z" strokeLinejoin="round" />
    </svg>
  ),
  // A rosette: Credits, the projects the site is built on.
  credits: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="7.5" r="4.5" />
      <path d="M7.2 11 5.5 17.5 10 15.5 14.5 17.5 12.8 11" strokeLinejoin="round" />
    </svg>
  ),
  // An open book: the Story page.
  story: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 5.5C8.3 4.2 5.8 3.8 2.5 4v11.5c3.3-.2 5.8.2 7.5 1.5 1.7-1.3 4.2-1.7 7.5-1.5V4c-3.3-.2-5.8.2-7.5 1.5Z" strokeLinejoin="round" />
      <path d="M10 5.5V17" />
    </svg>
  ),
  base: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="7" width="6" height="10" />
      <rect x="11.5" y="2.5" width="6" height="14.5" />
      <rect x="8.5" y="11" width="3" height="6" />
    </svg>
  ),
  planner: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2.5 15L7.5 9L11 12L17.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 4.5H17.5V9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // Originite Prime's cut stone: the OP Tracker.
  prime: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5L16.5 8L10 17.5L3.5 8Z" strokeLinejoin="round" />
      <path d="M3.5 8H16.5M7.5 8L10 17.5L12.5 8M7.5 8L10 2.5L12.5 8" strokeLinejoin="round" />
    </svg>
  ),
  calculator: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <rect x="6.8" y="5" width="6.4" height="2.6" rx="0.6" />
      <path d="M7.4 10.6h.01M10 10.6h.01M12.6 10.6h.01M7.4 13.8h.01M10 13.8h.01M12.6 13.8h.01" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="15" r="2.3" />
      <circle cx="15" cy="13" r="2.3" />
      <path d="M8.3 15 V5.5 L17.3 3.5 V11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 17S2.5 12.5 2.5 7.2C2.5 4.6 4.5 3 6.7 3c1.4 0 2.6.7 3.3 1.9C10.7 3.7 11.9 3 13.3 3c2.2 0 4.2 1.6 4.2 4.2 0 5.3-7.5 9.8-7.5 9.8Z" strokeLinejoin="round" />
    </svg>
  ),
};
