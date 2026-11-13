export interface ServerDateInfo {
  /** Launch date for a permanent mode, without an end date. */
  releaseDate?: string;
  startAt?: string;
  endAt?: string;
  timingSource?: string;
  /** The event store's close where it outlasts the stages (GameWindowTimes.shopEndAt). */
  shopEndAt?: string;
  dateRange: string | null; // e.g. "2026/01/16–2026/02/06"
  note: string | null; // e.g. "as Arknights Global's 6th Anniversary event"
}

export interface ScheduleEvent {
  name: string;
  /** Confirmed collaboration hosted in another game; separate from server schedules. */
  externalGame?: { id: string; game: string; region: string; source: string; description: string; launchOnly: boolean };
  modeId?: string;
  /** Headhunting schedule entry, opening its banner rather than an event page. */
  bannerName?: string;
  poster: string | null;
  year: number;
  cn: ServerDateInfo;
  global: ServerDateInfo;
  tw: ServerDateInfo;
  // Only set on manually-added future events, where there's no real skin
  // data yet to auto-match by release text. Once the event actually
  // releases and skins.json picks up real entries, the automatic
  // name-based matching (scheduleSkinMatch.ts) takes over instead.
  linkedSkinNames?: string[];
  materials?: string[];
  pullsNeeded?: number;
  // Whether this event hosts a Fashion Review rotation in its Outfit
  // Store. Computed once at scrape time from the per-year event records rather than
  // inferred from the event name at render time -- true for events
  // directly confirmed via the wiki's own Fashion Review "Added in"
  // table, plus any Celebration/Carnival/Festival-tagged event from
  // Near Light onward (when the feature began), even if it happened
  // not to add any new skins that particular time.
  hasFashionReview?: boolean;
}
