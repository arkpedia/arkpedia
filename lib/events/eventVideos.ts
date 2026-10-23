/**
 * An event's official videos, as the official-videos stage files them in data/event-videos.json
 * (scripts/sync/sync-official-videos.mjs; scripts/sync/event-videos.mjs says which upload goes to
 * which event). Client-safe: the PVs tab reads the labels.
 */

/** What an upload is, read from its official title (event-videos.mjs videoKind). */
export type EventVideoKind = 'trailer' | 'animation' | 'teaser' | 'operator' | 'music' | 'special' | 'gameplay' | 'video';

export interface EventVideo {
  videoId: string;
  /** The title the official channel gave it. */
  title: string;
  kind: EventVideoKind;
  /** When the channel published it, an ISO instant. */
  published: string;
}

export interface EventVideosFile {
  events: Record<string, EventVideo[]>;
}

/** Each kind as the tab names it. The keys are quoted: audit:styles reads a bare `animation:`
 *  in a TS object as an inline animation style (scripts/audits/audit-motion.mjs). */
export const VIDEO_KIND_LABELS: Record<EventVideoKind, string> = {
  'trailer': 'Official trailer',
  'animation': 'Animation PV',
  'teaser': 'Teaser',
  'operator': 'Operator PV',
  'music': 'Music video',
  'special': 'Special',
  'gameplay': 'Gameplay',
  'video': 'Video',
};
