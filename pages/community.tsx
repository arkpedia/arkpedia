import { useEffect, useState } from 'react';
import { useReleaseTable } from '@/lib/content/context';
import type { YouTubeChannelConfig } from '@/lib/music/youtubeConfig';
import PageMeta from '@/components/layout/PageMeta';
import { REGIONAL_MATERIAL } from '@/lib/i18n/regionalMaterial';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import SearchInput from '@/components/ui/SearchInput';
import StickyControls from '@/components/ui/StickyControls';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import StyledSelect from '@/components/ui/StyledSelect';
import { ContentImg } from '@/components/content/ContentImage';
import { currentWebEvents, mergeWebEvents, webEventServer, WORLD_CATEGORIES, type WorldCategory, type WorldDirectory, type WorldWebEvent } from '@/lib/community/worldDirectory';
import { SERVER_IDS } from '@/lib/account-import/yostar';
import { useReaderClock } from '@/lib/time/readerClock';
import { GetStaticProps, type GetStaticPropsContext } from 'next';
import { withContentPage } from '@/lib/content/server';
import Link from 'next/link';
import { enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { getLatestVideos } from '@/lib/music/youtubeFeedsServer';
import { youtubeChannels, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterDiscoveryVideos } from '@/lib/music/youtubeDiscovery';
import { loadVideoDiscoveryContext } from '@/lib/music/youtubeContextServer';
import { readLocalVideoArchive } from '@/lib/music/youtubeArchiveServer';
import type { VideoDiscoveryContext } from '@/lib/music/youtubeRelevance';
import { useLiveTwitchStreams } from '@/lib/community/useLiveTwitchStreams';
import { EVENTS } from '@/lib/schedule/eventsConfig';
import { CommunityEvent } from '@/lib/schedule/eventTypes';
import WorldMapEvents from '@/components/schedule/WorldMapEvents';
import EventListPanel from '@/components/schedule/EventListPanel';
import PageHeader from '@/components/ui/PageHeader';
import { TwitchCard } from '@/components/community/StreamCards';
import YouTubeVideoGallery from '@/components/community/YouTubeVideoGallery';

/** The campaigns record, read on the server only. JSON types `kind` as a plain string;
    test-community-web-events.ts holds every record's kind to the type's values. */
const publishedWebEvents = async () => (await import('@/data/community-web-events.json')).default as WorldWebEvent[];


interface Props {
  directory?: WorldDirectory;
  videos: YouTubeVideo[];
  videoArchive?: YouTubeVideo[];
  videoContext?: VideoDiscoveryContext;
  events: CommunityEvent[];
  /** The request's moment (lib/content/pageClock.ts): the event panels render from it until they mount. */
  now: number;
  hasYouTubeApiKey: boolean;
}

export default function CommunityHub({
  directory = { creators: [], webEvents: [], discord: [] },
  videos,
  videoContext,
  events,
  now,
  hasYouTubeApiKey,
}: Props) {
  const { streams: twitchStreams, loading: twitchLoading, available: twitchAvailable } = useLiveTwitchStreams();
  const { channels: YOUTUBE_CHANNELS } = useReleaseTable<{ channels: YouTubeChannelConfig[] }>('youtube-creators');
  const [categoryQuery, setCategory] = useQueryState('section', 'offline');
  const category: WorldCategory = WORLD_CATEGORIES.find(option => option.value === categoryQuery)?.value ?? 'offline';
  const [query, setQuery] = useQueryState('q');
  const hold = useSwitchHold('community-hub');
  const readerNow = useReaderClock(now, { tickMs: 60_000, onFocus: true });
  const webEvents = currentWebEvents(directory.webEvents, readerNow);
  const [country, setCountry] = useState('');
  useEffect(() => { try { setCountry(localStorage.getItem('arkpedia.world.country') ?? ''); } catch { /* private mode */ } }, []);
  const countries = [...new Set(events.map(event => event.country))].sort();
  const localEvents = country ? events.filter(event => event.country === country) : events;
  const needle = query.trim().toLocaleLowerCase();
  const creators = directory.creators.filter(creator => creator.category === category && (!needle || `${creator.name} ${creator.works.map(work => work.character).join(' ')}`.toLocaleLowerCase().includes(needle)));
  return <>
    <PageMeta title="World" description="Arknights community events, streams, videos and projects from around the world." path="/community" />
    <PageHeader eyebrow="Rhodes Island // Around the world" title="World" sub="Events, creators and communities." />
    <main>
      <StickyControls><Tabs label="World sections" id="world-sections" value={category} options={WORLD_CATEGORIES} onChange={value => { hold.capture(); setCategory(value); setQuery(''); }} /></StickyControls>
      <div {...tabPanelProps('world-sections', category)} ref={hold.ref} style={hold.style}>
      {category === 'offline' ? <section className="op-section community-events" aria-label="Offline Events">
        <div className="live-section-heading-row"><h2>Offline Events</h2><StyledSelect label="Event country" value={country} options={[{ value: '', label: 'All countries' }, ...countries.map(value => ({ value, label: value }))]} onChange={value => { setCountry(value); try { localStorage.setItem('arkpedia.world.country', value); } catch { /* private mode */ } }} /></div>
        <div className="community-map-row"><div className="community-event-panel"><EventListPanel events={localEvents} now={now} /></div><div className="community-map-main"><WorldMapEvents events={localEvents} now={now} /></div></div>
      </section> : category === 'web' ? <section className="op-section"><h2>Web Events</h2>{/* One column per server (Global, JP, KR), each its own stack, so a server's art-less
          campaigns sit under its other events rather than wherever the grid's flow put them. */}<div className="world-web-columns">{SERVER_IDS.map(server => ({ server, events: webEvents.filter(event => (webEventServer(event) ?? 'en') === server) })).filter(column => column.events.length).map(column => <div key={column.server} className="world-web-column" data-server={REGIONAL_MATERIAL ? column.server : undefined}><div className="world-directory world-web-events">{column.events.map(event => <a key={event.url} className="ghost panel world-web-event" data-server={REGIONAL_MATERIAL ? webEventServer(event) ?? undefined : undefined} href={event.url} target="_blank" rel="noopener noreferrer">{event.image && <ContentImg className="world-web-event-art" src={event.image} alt={`${event.name} event art`} width={1200} height={630} />}<span>{event.region}</span>{event.kind === 'social' && <span className="label-tag">Social</span>}<b>{event.name} ↗</b><span>{event.start} – {event.end}</span>{event.closingTime && <span>Closes at {event.closingTime}</span>}</a>)}</div></div>)}</div>{/* Every server's web events for every server until the site has JP/KR languages (lib/i18n/regionalMaterial.ts). */}{REGIONAL_MATERIAL ? SERVER_IDS.filter(server => !webEvents.some(event => [server, null].includes(webEventServer(event)))).map(server => <p key={server} className="hint world-web-events-none" data-server={server}>No web events listed right now.</p>) : !webEvents.length && <p className="hint world-web-events-none">No web events listed right now.</p>}</section>
      : category === 'discord' ? <section className="op-section"><h2>Discord</h2><div className="world-directory">{directory.discord.map(server => <a className="ghost" key={server.url} href={server.url} target="_blank" rel="noreferrer">{server.name} ↗</a>)}</div></section>
      : category === 'youtube' ? <section className="op-section"><div className="live-section-heading-row"><h2>YouTube</h2><Link className="ghost btn-sm" href="/world/videos">All videos</Link></div>
        <SearchInput label="Search videos or creators" placeholder="Video or creator" value={query} onChange={setQuery} />
        <details className="pulls-disclosure"><summary>Content creators</summary><div className="world-directory">{YOUTUBE_CHANNELS.filter(channel => !needle || channel.label.toLocaleLowerCase().includes(needle)).map(channel => <a className="ghost" key={channel.id} href={`https://www.youtube.com/channel/${channel.id}`} target="_blank" rel="noreferrer">{channel.label} ↗</a>)}</div></details>
        <YouTubeVideoGallery videos={videos} query={query} context={videoContext} now={readerNow} />
      </section> : category === 'twitch' ? <section className="op-section"><div className="live-section-heading-row"><h2>Twitch</h2><Link className="ghost btn-sm" href="/world/twitch">All streams</Link></div><div className="world-gallery">{twitchStreams.map(stream => <TwitchCard key={stream.userLogin} s={stream} />)}</div>{!twitchStreams.length && <p className="hint" role="status">{twitchLoading ? 'Checking live streams…' : twitchAvailable ? 'No one’s live on Twitch right now.' : 'We can’t check who is live at the moment.'}</p>}</section>
      : <section className="op-section"><h2>{WORLD_CATEGORIES.find(value => value.value === category)?.label}</h2><SearchInput label="Search creators or characters" placeholder="Creator or character" value={query} onChange={setQuery} />
        <div className="world-gallery">{creators.map(creator => <article key={creator.url}><h3><a href={creator.url} target="_blank" rel="noreferrer">{creator.name} ↗</a></h3>{creator.works.filter(work => !needle || `${creator.name} ${work.character}`.toLocaleLowerCase().includes(needle)).map(work => <a key={work.source} href={work.source} target="_blank" rel="noreferrer"><ContentImg src={work.image} alt={work.title} width={480} height={480} /><span>{work.character} · {work.title}</span></a>)}</article>)}</div>
        {!creators.length && <p className="hint">No {needle ? 'matching ' : ''}creators listed yet.</p>}
      </section>}
      </div>
    </main>
  </>;

}

/* A page of the content release like /results: the site nav's art and the event list resolve
   against the release's asset pin, not the one this deploy's revisions.json carried. The
   feeds are live, not game data, so they are fetched on every revalidation (finalize) and
   never exported into the release; the builder holds only what the release should carry. */
async function withLiveFeeds(props: Props, context: GetStaticPropsContext): Promise<Props> {
  // New campaigns travel in the content release without a code deploy. This deployment's
  // record keeps the campaigns it knows visible while an older directory is still live.
  const existing = props.directory ?? (await import('@/data/world-directory.json')).default as WorldDirectory;
  const directory = { ...existing, webEvents: mergeWebEvents(await publishedWebEvents(), existing.webEvents) };
  const rawVideos = await getLatestVideos(await youtubeChannels(), VIDEOS_PER_CHANNEL, context);
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const enriched = await enrichWithLiveStatus(rawVideos, youtubeApiKey);

  // Livestreams (live or not) are dropped from display entirely, and
  // every remaining video must mention Arknights and not mention any
  // banned other-game keyword -- some configured channels post mixed
  // content, and this panel is specifically an Arknights feed.
  const { videoArchive, ...rest } = props;
  const archive = process.env.ARKPEDIA_YOUTUBE_FEED_FIXTURE ? [] : videoArchive ?? readLocalVideoArchive();
  const videos = filterDiscoveryVideos([...enriched, ...archive].filter((v) => !v.isLivestream));
  const videoContext = await loadVideoDiscoveryContext(props.now);

  return {
    ...rest,
    directory,
    videos,
    videoContext,
    hasYouTubeApiKey: Boolean(youtubeApiKey),
  };
}

/* bundledWhenUnpublished: a release compiled before /community became a content route
   (7f8a8a8d, live when this went in) has no such page, and without it every regeneration
   on Vercel threw "Published content is missing /community", so the feeds and LIVE badges
   stayed as the deploy built them until the next release. The builder reads only the
   compiled-in EVENTS, so it can run at runtime, and finalize fetches the feeds either way. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/community', async () => ({
  props: { directory: { ...(await import('@/data/world-directory.json')).default as WorldDirectory, webEvents: await publishedWebEvents() }, events: EVENTS, videos: [], videoArchive: readLocalVideoArchive(), hasYouTubeApiKey: false },
}), { finalize: withLiveFeeds, revalidate: 1500, bundledWhenUnpublished: true, tables: { 'youtube-creators': async () => (await import('@/data/youtube-creators.json')).default } });
