import { CommunityEvent } from './eventTypes';
import record from '@/data/community-offline-events.json';

// ---------------------------------------------------------------------
// The events themselves are arkpedia-data's record: an announced collab,
// convention guest or fan meet is an editorial edit there, with the rules
// its "about" states, and no deploy. lat/lng place the pin on the map;
// startTime drives the countdown / "LIVE NOW" status. The type lets
// endTime go (an event is then "live" for 24h after it starts), but every
// record gives one, with its zone: scripts/tests/test-community-offline-events.ts.
// ---------------------------------------------------------------------
export const EVENTS = record.events as CommunityEvent[];
