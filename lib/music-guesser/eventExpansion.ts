import type { EventMusic } from './associations';
import record from '@/data/music-guesser-event-expansion.json';

// Reviewed against PRTS music usage, the Japanese BGM reference, and stage assets.
// Sources and catalogue exclusions are documented in docs/song-guesser-coverage.md.
// The table itself is arkpedia-data's record: a new event's BGM lands there, not here.
export const EVENT_EXPANSION = record.events as EventMusic[];
