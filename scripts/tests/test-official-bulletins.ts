import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { bulletinKind, cleanTitle, noticeDate, OFFICIAL_BULLETINS, parseJumpLink, stableUrl, syncOfficialBulletins } from '../sync/sync-official-bulletins.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { OFFICIAL_USER_AGENT } from '../lib/official-endpoints.mjs';

const NOW = new Date('2026-10-18T12:00:00Z');
const config = (host: string, an: string | null) => ({ content: JSON.stringify({ funcVer: 'V1', configs: { V1: { network: {
  hv: `https://${host}/assetbundle/official/{0}/version`, hu: `https://${host}/assetbundle/official`,
  ...(an ? { an: `https://${host}/announce/{0}/announcement.meta.json` } : {}), prean: `https://webview.${host}` } } } }) });
const HOSTS: Record<string, string> = { en: 'en.test', jp: 'jp.test', kr: 'kr.test', cn: 'cn.test' };

type Answer = { status?: number; json?: unknown; bytes?: Buffer };
function server(answers: Record<string, Answer>, seen: string[] = [], agents: string[] = []) {
  return async (url: string, init?: any) => {
    seen.push(url);
    agents.push(init?.headers?.['user-agent']);
    const answer = answers[url];
    if (!answer) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
    const status = answer.status ?? 200;
    return { ok: status < 400, status, json: async () => answer.json, text: async () => JSON.stringify(answer.json),
      arrayBuffer: async () => { const b = answer.bytes ?? Buffer.from('img'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } };
  };
}

/** Every region's network_config, an empty board and an empty announcement list, plus `extra`. */
function boards(extra: Record<string, Answer> = {}) {
  const answers: Record<string, Answer> = {};
  const configUrl: Record<string, string> = {
    en: 'https://ak-conf.arknights.global/config/prod/official/network_config',
    jp: 'https://ak-conf.arknights.jp/config/prod/official/network_config',
    kr: 'https://ak-conf.arknights.kr/config/prod/official/network_config',
    cn: 'https://ak-conf.hypergryph.com/config/prod/official/network_config',
  };
  for (const [region, host] of Object.entries(HOSTS)) {
    answers[configUrl[region]] = { json: config(host, region === 'cn' ? 'dead' : 'yes') };
    answers[`https://webview.${host}/api/game/bulletinList?target=Android`] = { json: { data: { list: [{ cid: '0001', title: 'Quiet', category: 4, displayTime: '2026-10-17' }] } } };
    answers[`https://webview.${host}/api/game/bulletin/0001`] = { json: { data: { cid: '0001', jumpLink: '', bannerImageUrl: '', header: '' } } };
    answers[`https://${host}/announce/Android/announcement.meta.json`] = { json: { announceList: [] } };
  }
  return { ...answers, ...extra };
}

const tmp = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-bulletins-'));
  fs.mkdirSync(path.join(root, 'data'));
  return root;
};
const read = (root: string) => JSON.parse(fs.readFileSync(path.join(root, OFFICIAL_BULLETINS), 'utf8'));
const options = (fetcher: any) => ({ fetcher, now: NOW, pause: async () => {} });

test('a banner is told by its link to the recruit screen, which carries the pool id', () => {
  assert.deepEqual(parseJumpLink('uniwebview://move?target=recruit&param1=LIMITED_EN_42_0_1'), { target: 'recruit', param: 'LIMITED_EN_42_0_1' });
  assert.deepEqual(parseJumpLink('uniwebview://move?target=shop&param1=SKINSHOP'), { target: 'shop', param: 'SKINSHOP' });
  assert.equal(parseJumpLink(''), null);
  assert.equal(bulletinKind(1, { target: 'recruit', param: 'X' }), 'banner');
  assert.equal(bulletinKind(1, { target: 'shop', param: 'SKINSHOP' }), 'event');
  assert.equal(bulletinKind(2, null), 'news');
  assert.equal(bulletinKind(4, null), 'other');
});

test('titles are one line, notice pages lose their cache stamp, and a December notice read in January is last year\'s', () => {
  assert.equal(cleanTitle('スカウト\\n約諾'), 'スカウト 約諾');
  assert.equal(cleanTitle('05月08日\n闪断更新公告 '), '05月08日 闪断更新公告');
  assert.equal(stableUrl('https://x.test/announcement/1634.html?t=1792121649'), 'https://x.test/announcement/1634.html');
  assert.equal(noticeDate(10, 14, NOW), '2026-10-14');
  assert.equal(noticeDate(12, 28, new Date('2027-01-03T00:00:00Z')), '2026-12-28');
  assert.equal(noticeDate(13, 1, NOW), null);
});

test('every region\'s board is read, a banner keeps its pool id and its art\'s hash, and nothing of the notice itself', async () => {
  const root = tmp();
  try {
    const seen: string[] = [], agents: string[] = [];
    const fetcher = server(boards({
      'https://webview.en.test/api/game/bulletinList?target=Android': { json: { data: { list: [
        { cid: '8360', title: 'Sealed With Time', category: 1, displayTime: '2026-10-14' },
        { cid: '0593', title: 'Video Creation\\nEvent', category: 4, displayTime: '2026-10-14' },
      ] } } },
      'https://webview.en.test/api/game/bulletin/8360': { json: { data: { cid: '8360', category: 1, header: '', content: '<p>long text</p>',
        jumpLink: 'uniwebview://move?target=recruit&param1=LIMITED_EN_42_0_1', bannerImageUrl: 'https://img.test/banner.jpg' } } },
      'https://webview.en.test/api/game/bulletin/0593': { json: { data: { cid: '0593', jumpLink: '', bannerImageUrl: '', header: '' } } },
      'https://img.test/banner.jpg': { bytes: Buffer.from('banner bytes') },
      'https://en.test/announce/Android/announcement.meta.json': { json: { announceList: [
        { announceId: '1634', title: 'Sealed With Time', webUrl: 'https://en.test/announcement/1634.html?t=9', day: 14, month: 10, group: 'ACTIVITY' },
      ] } },
    }), seen, agents);
    const { problems } = await syncOfficialBulletins(root, options(fetcher));
    assert.deepEqual(problems, []);
    const en = read(root).regions.en;
    assert.deepEqual(en.bulletins.find((b: any) => b.id === '8360'), {
      id: '8360', kind: 'banner', category: 1, title: 'Sealed With Time', displayDate: '2026-10-14',
      link: { target: 'recruit', param: 'LIMITED_EN_42_0_1' }, poolId: 'LIMITED_EN_42_0_1',
      image: { url: 'https://img.test/banner.jpg', sha1: 'cab2a098011b82675a6deaecf2299f9ed26c4491', bytes: 12 }, firstSeen: '2026-10-18',
    });
    assert.equal(en.bulletins.find((b: any) => b.id === '0593').title, 'Video Creation Event');
    assert.ok(!JSON.stringify(read(root)).includes('long text'), 'the notice text is not kept');
    assert.deepEqual(en.notices, [{ id: '1634', group: 'ACTIVITY', title: 'Sealed With Time', date: '2026-10-14', url: 'https://en.test/announcement/1634.html', firstSeen: '2026-10-18' }]);
    assert.deepEqual(Object.keys(read(root).regions), ['en', 'jp', 'kr', 'cn']);
    assert.ok(!seen.some(url => url.startsWith('https://cn.test/announce/')), 'CN\'s dead announcement list is not read');
    assert.ok(agents.every(agent => agent === OFFICIAL_USER_AGENT), 'every request names the site');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an id already in the file is not asked for again, ids are strings, and a quiet day writes the same bytes', async () => {
  const root = tmp();
  try {
    await syncOfficialBulletins(root, options(server(boards())));
    const before = fs.readFileSync(path.join(root, OFFICIAL_BULLETINS), 'utf8');
    const seen: string[] = [];
    await syncOfficialBulletins(root, options(server(boards(), seen)));
    assert.equal(fs.readFileSync(path.join(root, OFFICIAL_BULLETINS), 'utf8'), before);
    assert.ok(!seen.some(url => url.includes('/api/game/bulletin/')), 'no detail is fetched for a known item');
    // "0001" is kept as "0001": a number would have lost the zeros and collided with "1".
    assert.equal(read(root).regions.en.bulletins[0].id, '0001');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an item the board drops stays in the file: the boards hold a dozen items and the history cannot be read back', async () => {
  const root = tmp();
  try {
    await syncOfficialBulletins(root, options(server(boards())));
    await syncOfficialBulletins(root, options(server(boards({
      'https://webview.en.test/api/game/bulletinList?target=Android': { json: { data: { list: [{ cid: '0002', title: 'Next', category: 4, displayTime: '2026-10-18' }] } } },
      'https://webview.en.test/api/game/bulletin/0002': { json: { data: { cid: '0002', jumpLink: '', bannerImageUrl: '' } } },
    }))));
    assert.deepEqual(read(root).regions.en.bulletins.map((b: any) => b.id), ['0002', '0001'], 'newest first');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a board that cannot be read keeps its facts; an unreadable item is left out and asked for again', async () => {
  const root = tmp();
  try {
    await syncOfficialBulletins(root, options(server(boards())));
    const { problems } = await syncOfficialBulletins(root, options(server(boards({
      'https://webview.jp.test/api/game/bulletinList?target=Android': { status: 503 },
      'https://webview.kr.test/api/game/bulletinList?target=Android': { json: { data: { list: [{ cid: '0009', title: 'Broken', category: 1, displayTime: '2026-10-18' }] } } },
      'https://webview.kr.test/api/game/bulletin/0009': { status: 500 },
    }))));
    assert.deepEqual(problems.map((p: any) => [p.key, p.action]), [['official-bulletins:jp:board', 'kept-previous'], ['official-bulletins:kr:0009', 'omitted-new']]);
    assert.deepEqual(read(root).regions.jp.bulletins.map((b: any) => b.id), ['0001']);
    assert.ok(!read(root).regions.kr.bulletins.some((b: any) => b.id === '0009'));
    const seen: string[] = [];
    await syncOfficialBulletins(root, options(server(boards({
      'https://webview.kr.test/api/game/bulletinList?target=Android': { json: { data: { list: [{ cid: '0009', title: 'Broken', category: 1, displayTime: '2026-10-18' }] } } },
      'https://webview.kr.test/api/game/bulletin/0009': { json: { data: { cid: '0009', jumpLink: '', bannerImageUrl: '' } } },
    }), seen)));
    assert.ok(seen.includes('https://webview.kr.test/api/game/bulletin/0009'));
    assert.ok(read(root).regions.kr.bulletins.some((b: any) => b.id === '0009'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a board whose newest item is weeks old is reported as having moved', async () => {
  const root = tmp();
  try {
    const { problems } = await syncOfficialBulletins(root, options(server(boards({
      'https://webview.cn.test/api/game/bulletinList?target=Android': { json: { data: { list: [{ cid: '2069', title: 'Old', category: 2, displayTime: '2025-05-08' }] } } },
      'https://webview.cn.test/api/game/bulletin/2069': { json: { data: { cid: '2069', jumpLink: '', bannerImageUrl: '' } } },
    }))));
    assert.deepEqual(problems.map((p: any) => p.key), ['official-bulletins:cn:stale']);
    assert.match(problems[0].reason, /2025-05-08/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an image that cannot be hashed keeps its address and is hashed on a later run', async () => {
  const root = tmp();
  const banner = (status?: number) => boards({
    'https://webview.en.test/api/game/bulletinList?target=Android': { json: { data: { list: [{ cid: '0100', title: 'Banner', category: 1, displayTime: '2026-10-18' }] } } },
    'https://webview.en.test/api/game/bulletin/0100': { json: { data: { cid: '0100', jumpLink: 'uniwebview://move?target=recruit&param1=P', bannerImageUrl: 'https://img.test/b.png' } } },
    'https://img.test/b.png': status ? { status } : { bytes: Buffer.from('png') },
  });
  try {
    await syncOfficialBulletins(root, options(server(banner(502))));
    assert.deepEqual(read(root).regions.en.bulletins.find((b: any) => b.id === '0100').image, { url: 'https://img.test/b.png' });
    await syncOfficialBulletins(root, options(server(banner())));
    assert.equal(read(root).regions.en.bulletins.find((b: any) => b.id === '0100').image.bytes, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
