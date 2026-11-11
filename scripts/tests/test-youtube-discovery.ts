import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoveryVideoTopic, featuredChannelVideos, videoTopic, FEATURED_VIDEO_WINDOW_MS } from '../../lib/music/youtubeDiscovery';
import type { YouTubeVideo } from '../../lib/music/youtube';

const now = Date.parse('2026-11-06T12:00:00Z');
const video = (id: string, channel: string, ageHours: number, extra: Partial<YouTubeVideo> = {}): YouTubeVideo => ({
  videoId: id, channelLabel: channel, title: 'Arknights video', publishedAt: new Date(now - ageHours * 3600000).toISOString(),
  thumbnail: '', url: `https://www.youtube.com/watch?v=${id}`, isLivestream: false, liveStatus: 'none', ...extra,
});

test('homepage rotates the newest recent upload per channel, sorted by time and deduplicated', () => {
  const selected = featuredChannelVideos([
    video('a-old', 'A', 5), video('b', 'B', 2), video('a-new', 'A', 1), video('old', 'Old', 49),
    video('boundary', 'C', 48), video('b', 'B', 2),
    video('future', 'Future', -1), video('invalid', 'Invalid', 0, { publishedAt: 'invalid' }),
    video('live', 'Live', 1, { isLivestream: true }), video('upcoming', 'Upcoming', 1, { liveStatus: 'upcoming' }),
    video('other', 'Other', 1, { title: 'A different game' }), video('banned', 'Banned', 1, { title: 'Arknights Endfield' }),
  ], now);
  assert.deepEqual(selected.map(v => v.videoId), ['a-new', 'b', 'boundary']);
  assert.equal(FEATURED_VIDEO_WINDOW_MS, 48 * 3600000);
});

test('a quiet two days falls back to the three newest available channels instead of an empty panel', () => {
  assert.deepEqual(featuredChannelVideos([video('a', 'A', 72), video('b', 'B', 73), video('a-older', 'A', 74),
    video('c', 'C', 75), video('ancient', 'D', 8000)], now).map(v => v.videoId), ['a', 'b', 'c']);
  assert.deepEqual(featuredChannelVideos([], now), []);
});

test('titles classify across creators, with specific formats winning over generic words', () => {
  const cases = [
    ['Arknights update: new event announced', 'news'],
    ['New operator announced! Arknights news', 'news'],
    ['Should You Save For Talulah? | Arknights', 'operators'],
    ['Explaining Why People Think Talulah Is Bad | Arknights', 'operators'],
    ['Arknights Annihilation 35 Low Rarity & Easy Guide', 'guides'],
    ['MT-8 3 operators | Arknights', 'guides'],
    ['明日方舟 攻略', 'guides'],
    ['No Sword? Viviana LIVE2D Skin Comparison!! [Arknights]', 'skins'],
    ['Arknights Animation PV - The Masses’ Travels Rerun', 'media'],
    ['ARKNIGHTS X ARCAEA SONG LIST REACTION', 'media'],
    ['Arknights update reaction and thoughts', 'news'],
    ['Arknights: my opinion', 'discussions'],
    ['Is IS4 The Hardest IS? [Arknights]', 'discussions'],
    ['Arknights Integrated Strategies 5 challenge', 'gameplay'],
    ['Talulah and Tocka Pulls!! [Arknights]', 'gameplay'],
    ['Is Arknights worth playing in 2026?', 'reviews'],
    ['Arknights review', 'reviews'],
    ['Arknights: a very surprising day', 'other'],
  ] as const;
  for (const [title, expected] of cases) assert.equal(videoTopic(title), expected, title);
});

test('upcoming outfits and Stronghold audio use their specific categories instead of Other', () => {
  const cases = [
    ['Upcoming Operators/Outfits - Monster Hunter Collab 2 | Arknights 近日実装 オペレーター', 'skins'],
    ['Upcoming outfits announced | Arknights', 'skins'],
    ['Arknights skins and costumes preview', 'skins'],
    ['Stronghold Protocol: Regulation Mix | Arknights 坚守协议 BGM集', 'media'],
    ['Closure Stronghold Protocol JP Voice Lines | Arknights 坚守协议 クロージャボイス集', 'media'],
    ['Arknights voice-line compilation', 'media'],
    ['Arknights BGM compilation', 'media'],
    // The mode itself is not a music keyword: its guides and news stay separate.
    ['Stronghold Protocol Regulation AFK Guide | Arknights', 'guides'],
    ['Stronghold Protocol update announced | Arknights', 'news'],
  ] as const;
  for (const [title, expected] of cases) {
    assert.equal(discoveryVideoTopic(video('fixture', 'RiverV Workshop', 1, { title })), expected, title);
  }
});
