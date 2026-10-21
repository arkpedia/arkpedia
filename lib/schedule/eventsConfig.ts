import { CommunityEvent } from './eventTypes';

// ---------------------------------------------------------------------
// Add real events here. lat/lng place the pin on the map; startTime
// drives the countdown / "LIVE NOW" status. endTime is optional -- if
// omitted, an event is considered "live" for 24h after it starts.
// ---------------------------------------------------------------------
export const EVENTS: CommunityEvent[] = [
  {
    name: 'Anime NYC',
    country: 'USA',
    lat: 40.75687300453171,
    lng: -74.00167779469811,
    startTime: '2026-08-20T14:00:00Z',
    endTime: '2026-08-24T00:00:00Z',
    url: 'https://animenyc.com',
  },
  {
    name: 'gamescom',
    country: 'Germany',
    lat: 50.94298302529292,
    lng: 6.975315345057641,
    startTime: '2026-08-26T08:00:00Z',
    endTime: '2026-08-30T18:00:00Z',
    url: 'https://gamescom.global',
  },
  {
    name: 'Arknights: Endfield x Koi The',
    country: 'Singapore',
    lat: 1.3521,
    lng: 103.8198,
    startTime: '2026-08-19T16:00:00Z',
    endTime: '2026-09-02T16:00:00Z',
    url: '',
  },
  {
    name: 'Arknights: Endfield x Koi The',
    country: 'Malaysia',
    lat: 3.1390,
    lng: 101.6869,
    startTime: '2026-08-26T16:00:00Z',
    endTime: '2026-09-09T16:00:00Z',
    url: '',
  },
  {
    name: 'Arknights: Endfield x Coco Tea',
    country: 'Thailand',
    lat: 13.7563,
    lng: 100.5018,
    startTime: '2026-08-21T17:00:00Z',
    endTime: '2026-09-03T17:00:00Z',
    url: '',
  },
  {
    name: 'Arknights: Endfield x Kopitagram',
    country: 'Indonesia',
    lat: -6.2088,
    lng: 106.8456,
    startTime: '2026-08-20T17:00:00Z',
    endTime: '2026-09-05T17:00:00Z',
    url: 'https://x.com/AKEndfieldID/status/2086769745706316279',
  },
  // Two-day pop-up for the "Sanctuary of Ink" version at Tokyu Plaza Omotesando
  // "Omokado": exhibits, photo spots, mini-games and a stage. Hours were not published
  // by the publisher, so the record spans both whole days (JST).
  {
    name: 'Arknights: Endfield "An Autumn Day with Su" Pop-Up',
    country: 'Japan',
    lat: 35.6688,
    lng: 139.7055,
    startTime: '2026-10-17T00:00:00+09:00',
    endTime: '2026-10-19T00:00:00+09:00',
    url: 'https://prtimes.jp/main/html/rd/p/000000045.000126152.html',
  },
  // Endfield booth at gamescom asia x Thailand Game Show (QSNCC, Bangkok): playable
  // demo, booth events and merchandise. Public days and standard ticket hours are from
  // gamescom.asia/tickets; the post's Oct 17-24 window is its giveaway, not the show.
  {
    name: 'Arknights: Endfield at gamescom asia x Thailand Game Show',
    country: 'Thailand',
    lat: 13.7240,
    lng: 100.5596,
    startTime: '2026-10-30T10:00:00+07:00',
    endTime: '2026-11-01T19:00:00+07:00',
    url: 'https://x.com/AKEndfield/status/2111306210397794669',
  },
  // Three-month Round1 collaboration at stores across Japan: bowling, collab karaoke
  // rooms, an AR stamp rally and limited goods. The publisher gives "from Nov 10, for
  // three months"; Feb 10 is that period's last day.
  {
    name: 'Arknights: Endfield x Round1',
    country: 'Japan',
    lat: 35.6762,
    lng: 139.6503,
    startTime: '2026-11-10T00:00:00+09:00',
    endTime: '2027-02-11T00:00:00+09:00',
    url: 'https://prtimes.jp/main/html/rd/p/000000044.000126152.html',
  },
  // Korean first-anniversary festival ("Endfield Only Event") at KINTEX Exhibition
  // Centre 2, Hall 10A: theme zones, stage events, a cosplay parade and fan-creation
  // booths. Festival hours are not announced yet.
  {
    name: 'Arknights: Endfield 1st Anniversary Festival (Endfield Only Event)',
    country: 'South Korea',
    lat: 37.6697,
    lng: 126.7437,
    startTime: '2027-01-09T00:00:00+09:00',
    endTime: '2027-01-11T00:00:00+09:00',
    url: 'https://x.com/AKEndfieldKR/status/2109539569381355768',
  },
  // Japanese first-anniversary festival at Makuhari Messe International Exhibition
  // Halls. Programme and hours are still to be announced.
  {
    name: 'Arknights: Endfield 1st Anniversary Festival',
    country: 'Japan',
    lat: 35.6480,
    lng: 140.0346,
    startTime: '2027-01-10T00:00:00+09:00',
    endTime: '2027-01-12T00:00:00+09:00',
    url: 'https://x.com/AKEndfieldJP/status/2107449958416953597',
  },
];