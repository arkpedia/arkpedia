export type CommunityEventKind = 'collab' | 'guest' | 'fan';

export interface CommunityEvent {
  name: string;
  country: string;
  lat: number;
  lng: number;
  startTime: string; // ISO date string, e.g. "2026-08-15T14:00:00Z"
  endTime?: string; // ISO date string. If omitted, defaults to 24h after startTime.
  url: string;
  /** What sort of event it is, when it is not an official Arknights convention presence.
   *  The list labels each one: "Collab" is an official brand, café or shop tie-in; "Guest" a
   *  convention with a credited Arknights illustrator or voice actor as an announced guest;
   *  "Fan" a community-run gathering with a public event page. */
  kind?: CommunityEventKind;
}