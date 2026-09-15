export interface CommunityEvent {
  name: string;
  country: string;
  lat: number;
  lng: number;
  startTime: string; // ISO date string, e.g. "2026-08-15T14:00:00Z"
  endTime?: string; // ISO date string. If omitted, defaults to 24h after startTime.
  url: string;
}