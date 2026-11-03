import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMusicClaimRisk } from '../../lib/music/claimRisk';
import { songAllowed, refilterQueue } from '../../lib/music/songFilter';
import { loadMusicCatalogue, projectMusicCatalogue } from '../../lib/music/musicCatalogue';
import { getAllSongsFull, getMonsterSirenOnlySongs } from '../../lib/music/albumsData';

const safe = { excludeCopyrighted: true, includeEndfield: true };

test('artist exclusions recognize credited aliases without matching other artists', () => {
  for (const artist of ['Yuki Hayashi', ' YUKI\u00a0HAYASHI ', 'Hayashi Yūki', '林 ゆうき', 'MSR, Yuki Hayashi', 'MSR & Yuki Hayashi']) {
    assert.equal(songAllowed(safe, { artist, copyright: false }), false, artist);
    assert.equal(songAllowed({ ...safe, excludeCopyrighted: false }, { artist }), true, artist);
  }
  for (const artist of ['Adam Gubman', 'Sarah Kang', 'BaoUner', 'Yuki Hayashida', 'Not Yuki Hayashi']) {
    assert.equal(hasMusicClaimRisk({ artist }), false, artist);
  }
  assert.equal(hasMusicClaimRisk({ composer: 'Yuki Hayashi' }), true);
  assert.equal(hasMusicClaimRisk({ credits: [{ names: ['Yuki Hayashi'] }] }), true);
  assert.equal(hasMusicClaimRisk({ copyright: true, artist: 'Another artist' }), true);
  assert.equal(hasMusicClaimRisk({}), false);
});

test('reported recordings are excluded through catalogue generation while Magic Theorem stays available', () => {
  const songs = [...getAllSongsFull(), ...getMonsterSirenOnlySongs()];
  const reported = new Set(['232280', '461179', '232289', '514545']);
  const affected = songs.filter(song => reported.has(song.songId));
  assert.equal(affected.length, 4);
  assert.ok(affected.every(song => song.copyright && !songAllowed(safe, song)));
  assert.ok(projectMusicCatalogue(affected).songs.every(song => song.copyright));
  const magic = songs.filter(song => ['880368', '514576'].includes(song.songId));
  assert.equal(magic.length, 2);
  assert.ok(magic.every(song => songAllowed(safe, song)));
});

test('new credited songs publish the exclusion without needing a per-song flag', () => {
  const fixture = { ...getAllSongsFull()[0], copyright: false, artist: null, composer: null,
    credits: [{ role: 'composer', names: ['Yuki Hayashi'] }] };
  assert.equal(projectMusicCatalogue([fixture]).songs[0].copyright, true);
});

test('old releases and deployment fallbacks gain the artist flag before entering the queue', async () => {
  for (const useFallback of [false, true]) {
    const songs = await loadMusicCatalogue('/release/music-catalogue.json', undefined, async url => ({
      ok: !useFallback || url === '/music-catalogue.json', status: useFallback && url !== '/music-catalogue.json' ? 503 : 200,
      json: async () => ({ songs: [
        { videoId: 'claimed0001', title: 'Old release', artist: 'Yuki Hayashi' },
        { cid: '123456', title: 'MSR audio', artist: 'Yuki Hayashi' },
        { videoId: 'allowed0001', title: 'Other artist', artist: 'Adam Gubman' },
      ] }),
    }));
    assert.equal(songs.find(song => song.id === 'claimed0001')?.copyright, true);
    assert.equal(songs.find(song => song.id === 'msr:123456')?.copyright, true);
    assert.equal(songs.find(song => song.id === 'allowed0001')?.copyright, undefined);
    const queue = refilterQueue({ queue: songs.map(song => ({ id: song.id })), queueIndex: 0, shuffleOrder: null,
      catalogue: songs, before: { ...safe, excludeCopyrighted: false }, after: safe,
      toTrack: song => ({ id: song.id }), playlistIds: null });
    assert.deepEqual(queue.queue.map(song => song.id), ['allowed0001']);
  }
});

test('existing excluded performers and reported Adele recordings inherit exclusions', async () => {
  for (const name of ['DJ Okawari','Ai Ninomiya','Kaori Sawada','Low Roar','Stephanie','AIYUE','Rina','Mili','ZOEE']) {
    assert.equal(hasMusicClaimRisk({artist:name}),true,name);
    assert.equal(hasMusicClaimRisk({credits:[{names:[name]}]}),true,name);
    assert.equal(songAllowed({...safe,excludeCopyrighted:false},{artist:name}),true);
  }
  for(const name of ['Kirara Magic','Obadiah Brown-Beach','Elvin Shen','Sarah Kang','Adam Gubman','Rina Other'])assert.equal(hasMusicClaimRisk({artist:name}),false,name);
  const misty=getAllSongsFull().filter(song=>['048708','306816','880333'].includes(song.songId));
  assert.equal(misty.length,3);assert.ok(misty.every(song=>song.copyright));
  const old=await loadMusicCatalogue('/old.json',undefined,async()=>({ok:true,status:200,json:async()=>({songs:misty.map(song=>({videoId:song.videoId,cid:song.songId,title:song.title,artist:song.artist}))})}));
  const reported=old.filter(song=>['048708','306816','880333'].includes(song.cid??''));
  assert.equal(reported.length,3);assert.ok(reported.every(song=>song.copyright));
});


test('requested crossover artists are excluded in mixed credits and published catalogues', async () => {
  const artists=['ReoNa','STARSET','Steve Aoki','Yellow Claw','RUNN','MONKEY MAJIK','Mili','ZOEE'];
  for(const artist of artists){
    assert.equal(hasMusicClaimRisk({artist:artist.toLowerCase()}),true,artist);
    assert.equal(hasMusicClaimRisk({credits:[{names:[artist]}]}),true,artist);
    assert.equal(songAllowed({...safe,excludeCopyrighted:false},{artist}),true,artist);
  }
  assert.equal(hasMusicClaimRisk({artist:'Steve Aoki / Yellow Claw / RUNN'}),true);
  assert.equal(hasMusicClaimRisk({artist:'Yellow Claw feat. RUNN'}),true);
  assert.equal(hasMusicClaimRisk({artist:'Running Wild'}),false);
  const loaded=await loadMusicCatalogue('/old.json',undefined,async()=>({ok:true,status:200,json:async()=>({songs:artists.map((artist,i)=>({cid:String(910000+i),title:artist,artist}))})}));
  assert.ok(loaded.filter(song=>artists.includes(song.title)).every(song=>!songAllowed(safe,song)));
});


test('older compact catalogues exclude recordings with omitted performer credits', async () => {
  const cids=['514540','779499','514546','048703'];
  const source=[...getAllSongsFull(),...getMonsterSirenOnlySongs()].filter(song=>cids.includes(song.songId));
  assert.equal(source.length,4);assert.ok(source.every(song=>song.copyright));
  const rows=await loadMusicCatalogue('/old.json',undefined,async()=>({ok:true,status:200,json:async()=>({songs:source.map(song=>({cid:song.songId,videoId:song.videoId||undefined,title:song.title}))})}));
  assert.ok(rows.filter(song=>cids.includes(song.cid??'')).every(song=>!songAllowed(safe,song)));
});


test('duplicate recordings retain an exclusion from either album credit', async () => {
  for(const reverse of [false,true]){
    const songs=[{videoId:'samevideo01',title:'First album',artist:'BaoUner'},{videoId:'samevideo01',title:'Second album',artist:'Yuki Hayashi'}];
    if(reverse)songs.reverse();
    const rows=await loadMusicCatalogue('/old.json',undefined,async()=>({ok:true,status:200,json:async()=>({songs})}));
    const matches=rows.filter(song=>song.id==='samevideo01');
    assert.equal(matches.length,1);assert.equal(matches[0].title,songs[0].title);assert.equal(matches[0].copyright,true);
  }
});
