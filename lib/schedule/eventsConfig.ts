import { CommunityEvent } from './eventTypes';

// ---------------------------------------------------------------------
// Add real events here. lat/lng place the pin on the map; startTime
// drives the countdown / "LIVE NOW" status. The type lets endTime go (an
// event is then "live" for 24h after it starts), but every record here
// gives one, with its zone: scripts/tests/test-community-offline-events.ts.
// ---------------------------------------------------------------------
export const EVENTS: CommunityEvent[] = [
  // Official Arknights collaborations in Korea, from the KR official Naver Cafe notices
  // (cafe 29703924). Times are KST; where a notice gives dates without hours, the record
  // spans whole days. Pins are approximate: the venue's district or the city.
  //
  // Banolim Pizza menu collab at stores across Korea: two collab sets, and a themed box
  // with an L-size order. The notice gives 10/16 (Fri) to 11/08 (Sun), no hours.
  {
    name: 'Arknights x Banolim Pizza',
    country: 'South Korea',
    lat: 37.5665,
    lng: 126.9780,
    startTime: '2026-10-16T00:00:00+09:00',
    endTime: '2026-11-08T23:59:00+09:00',
    url: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1248495',
    kind: 'collab',
  },
  // Two-day "Special Corner" at Banolim Pizza's Seocho store (Banpo-daero 27-gil, Seoul):
  // reservation-only visits with collab goods and a lucky draw, 10:00-17:40 both days.
  {
    name: 'Arknights x Banolim Pizza Special Corner (Seocho)',
    country: 'South Korea',
    lat: 37.4920,
    lng: 127.0110,
    startTime: '2026-10-24T10:00:00+09:00',
    endTime: '2026-10-25T17:40:00+09:00',
    url: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1248505',
    kind: 'collab',
  },
  // animate cafe collab: Hongdae and Jamsil Lotte (a Gratte collab) from 10/16, Busan from
  // 10/30, all to 11/17 (Tue). Hours differ by store and were not given in the notice.
  {
    name: 'Arknights x animate cafe (Hongdae)',
    country: 'South Korea',
    lat: 37.5563,
    lng: 126.9236,
    startTime: '2026-10-16T00:00:00+09:00',
    endTime: '2026-11-17T23:59:00+09:00',
    url: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1247801',
    kind: 'collab',
  },
  {
    name: 'Arknights x animate Gratte (Jamsil Lotte)',
    country: 'South Korea',
    lat: 37.5113,
    lng: 127.0980,
    startTime: '2026-10-16T00:00:00+09:00',
    endTime: '2026-11-17T23:59:00+09:00',
    url: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1247801',
    kind: 'collab',
  },
  {
    name: 'Arknights x animate cafe (Busan)',
    country: 'South Korea',
    lat: 35.1577,
    lng: 129.0596,
    startTime: '2026-10-30T00:00:00+09:00',
    endTime: '2026-11-17T23:59:00+09:00',
    url: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1247801',
    kind: 'collab',
  },
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
    endTime: '2026-09-05T16:59:00Z',
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
    endTime: '2026-10-18T23:59:00+09:00',
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
    endTime: '2027-02-10T23:59:00+09:00',
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
    endTime: '2027-01-10T23:59:00+09:00',
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
    endTime: '2027-01-11T23:59:00+09:00',
    url: 'https://x.com/AKEndfieldJP/status/2107449958416953597',
  },
  // Global fan gatherings: community-run, each with a public event page. Records carry the
  // public title, place and dates only, never an organiser's or attendee's name.
  //
  // Four fan-run meets in MCM London Comic Con's official Fan Meets schedule at ExCeL
  // London, all at the foot of the stairs by the Dockers statue on Royal Victoria Square:
  // Sat 24 Oct 13:00-14:00, 14:00-15:00 and 16:00-17:00, Sun 25 Oct 16:00-17:00 (schedule
  // ids 950494, 950495, 951721, 951722). UK clocks go back overnight, so Saturday is BST and
  // Sunday GMT. MCM notes that a listed meet is not one it runs.
  {
    name: 'Arknights & Endfield fan meets at MCM London Comic Con',
    country: 'United Kingdom',
    lat: 51.5085,
    lng: 0.0295,
    startTime: '2026-10-24T13:00:00+01:00',
    endTime: '2026-10-25T17:00:00+00:00',
    url: 'https://www.mcmcomiccon.com/london/en-us/things-to-do/fans-meet.html',
    kind: 'fan',
  },
  // Fan-run "Only" event in the Great Hall, King's College London Strand Campus:
  // 15:00-22:00 GMT, last entry 19:00, ticketed.
  {
    name: '2026 Arknights and Endfield Only UK',
    country: 'United Kingdom',
    lat: 51.5115,
    lng: -0.1160,
    startTime: '2026-11-14T15:00:00+00:00',
    endTime: '2026-11-14T22:00:00+00:00',
    url: 'https://events.humanitix.com/2026-arknights-and-endfield-only-uk',
    kind: 'fan',
  },
  // Taiwan's first fan-run Arknights Only doujin event, 5F of the Taipei Hakka Culture
  // Center (Tingzhou Rd. Sec. 3, Zhongzheng). The announcement gives the day, no hours.
  {
    name: 'Arknights Only (Taipei)',
    country: 'Taiwan',
    lat: 25.0120,
    lng: 121.5310,
    startTime: '2026-11-14T00:00:00+08:00',
    endTime: '2026-11-14T23:59:00+08:00',
    url: 'https://home.gamer.com.tw/artwork.php?sn=6321677',
    kind: 'fan',
  },
  // Conventions with a credited Arknights illustrator or voice actor as an announced guest,
  // from each convention's own guest page. The name says who; credits are as /artists and
  // /voice-actors have them. Where a convention publishes no hours, the record spans
  // whole days in the venue's zone.
  //
  // Youmacon, Huntington Place, Detroit: Marina Inoue (Pallas, JP), Hikaru Midorikawa
  // (Gnosis, THRM-EX, JP), Anne Yatco (Ho'olheyak, EN). US clocks go back on Nov 1.
  {
    name: 'Youmacon 2026: Marina Inoue, Hikaru Midorikawa, Anne Yatco',
    country: 'USA',
    lat: 42.3289,
    lng: -83.0496,
    startTime: '2026-10-29T00:00:00-04:00',
    endTime: '2026-11-01T23:59:00-05:00',
    url: 'https://youmacon.com/guests/',
    kind: 'guest',
  },
  // Anime Weekend Atlanta, Georgia World Congress Center Building C, all English voices:
  // Allegra Clark (Proviso, Dorothy, Penance), AmaLee (Ceylon), Anjali Kunapaneni
  // (Cardigan, Mayer, Scene), Crystal Lee (Kichisei), Xanthe Huynh (Provence, Cuora).
  // Exhibit hall Thu 12:00 to Sun 17:00.
  {
    name: 'Anime Weekend Atlanta 2026: Allegra Clark, AmaLee, Anjali Kunapaneni, Crystal Lee, Xanthe Huynh',
    country: 'USA',
    lat: 33.7590,
    lng: -84.3990,
    startTime: '2026-11-19T12:00:00-05:00',
    endTime: '2026-11-22T17:00:00-05:00',
    url: 'https://awa-con.com/guests/',
    kind: 'guest',
  },
  // Anime Revolution Toronto, Metro Toronto Convention Centre North Building:
  // Shin-Ichiro Miki (Lee, JP) and Xanthe Huynh (Provence, Cuora, EN). The convention
  // publishes weekday hours (Fri 10:00-22:00 to Sun 10:00-20:00, Thursday is badge pickup
  // only); the dates are the venue's listing, Nov 12-15 with that Thursday pickup.
  {
    name: 'Anime Revolution Toronto 2026: Shin-ichiro Miki, Xanthe Huynh',
    country: 'Canada',
    lat: 43.6440,
    lng: -79.3870,
    startTime: '2026-11-13T10:00:00-05:00',
    endTime: '2026-11-15T20:00:00-05:00',
    url: 'https://toronto.animerevolution.ca/guests/',
    kind: 'guest',
  },
  // Anime Festival Asia Singapore, Suntec Halls 401-406, exhibition 10:00-20:00: Namie
  // (Mizuki, Goldenglow, Pepe) as a featured exhibition guest; on the day stage Satomi Arai
  // (新井里美: Gallus², JP), and on Sat 28 Nov Shin-ichiro Miki (Lee, JP) and Tarusuke
  // Shingaki (Nowell, JP). The guests page names Namie and Satomi Arai, the festival's
  // front page the Saturday stage.
  {
    name: 'AFA Singapore 2026: Namie, Satomi Arai, Shin-ichiro Miki, Tarusuke Shingaki',
    country: 'Singapore',
    lat: 1.2935,
    lng: 103.8573,
    startTime: '2026-11-27T10:00:00+08:00',
    endTime: '2026-11-29T20:00:00+08:00',
    url: 'https://animefestival.asia/afasg26/guests/',
    kind: 'guest',
  },
  // Holiday Matsuri, Orange County Convention Center West Concourse, Orlando:
  // Suzie Yeung (Shu, EN).
  {
    name: 'Holiday Matsuri 2026: Suzie Yeung',
    country: 'USA',
    lat: 28.4248,
    lng: -81.4690,
    startTime: '2026-12-18T00:00:00-05:00',
    endTime: '2026-12-20T23:59:00-05:00',
    url: 'https://holidaymatsuri.com/guests/',
    kind: 'guest',
  },
  // Anime Milwaukee, Baird Center & Hilton Milwaukee: Monica Rial (Absinthe, EN).
  {
    name: 'Anime Milwaukee 2027: Monica Rial',
    country: 'USA',
    lat: 43.0389,
    lng: -87.9170,
    startTime: '2027-03-05T00:00:00-06:00',
    endTime: '2027-03-07T23:59:00-06:00',
    url: 'https://animemilwaukee.org/guests-of-honor',
    kind: 'guest',
  },
  // Sakura-Con, Seattle: Monica Rial (Absinthe, EN). US clocks go forward on Mar 14.
  {
    name: 'Sakura-Con 2027: Monica Rial',
    country: 'USA',
    lat: 47.6114,
    lng: -122.3321,
    startTime: '2027-03-26T00:00:00-07:00',
    endTime: '2027-03-28T23:59:00-07:00',
    url: 'https://sakuracon.org/guests/',
    kind: 'guest',
  },
];