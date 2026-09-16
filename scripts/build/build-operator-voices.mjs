#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const OUTPUT = join(ROOT, 'data/operator-voice-lines.json');
const VOICE_REPOSITORIES = {
  voice: 'arkpedia-voice-japanese',
  voice_cn: 'arkpedia-voice-mandarin',
  voice_custom: 'arkpedia-voice-regional',
  voice_en: 'arkpedia-voice-english',
  voice_kr: 'arkpedia-voice-korean',
};
const AUDIO_ROOTS = Object.fromEntries(Object.entries(VOICE_REPOSITORIES).map(([directory, repository]) => [
  directory,
  `https://raw.githubusercontent.com/arkpedia/${repository}/main/current`,
]));
const AUDIO_DIRECTORY_APIS = Object.fromEntries(Object.entries(VOICE_REPOSITORIES).map(([directory, repository]) => [
  directory,
  `https://api.github.com/repos/arkpedia/${repository}/contents/current`,
]));
const LEGACY_AUDIO_ROOTS = {
  voice: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/legacy',
  voice_old: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/legacy',
  voice_cn: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-mandarin/main/legacy',
  voice_en: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/legacy',
};
const URLS = {
  en: 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/charword_table.json',
  cn: 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/charword_table.json',
  archive: 'https://codeload.github.com/PseudoMon/tlvr-source/zip/refs/heads/master',
  audioIndex: 'https://raw.githubusercontent.com/isHarryh/Ark-Voice/master/voice_data.json',
};

async function jsonInput(envName, url) {
  const local = process.env[envName];
  if (local) return JSON.parse(readFileSync(local, 'utf8'));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${envName}: ${response.status} ${response.statusText}`);
  return response.json();
}

async function tlvrDirectory() {
  if (process.env.ARKPEDIA_TLVR_DIR) return process.env.ARKPEDIA_TLVR_DIR;
  const work = mkdtempSync(join(tmpdir(), 'arkpedia-voices-'));
  const zip = join(work, 'tlvr.zip');
  const response = await fetch(URLS.archive);
  if (!response.ok) throw new Error(`TLVR: ${response.status} ${response.statusText}`);
  writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  execFileSync('unzip', ['-q', zip, '-d', work]);
  return join(work, 'tlvr-source-master', 'datascript', 'chardata');
}

async function audioDirectoryIndex() {
  const local = process.env.ARKPEDIA_VOICE_ASSET_INDEX;
  if (local) {
    const data = JSON.parse(readFileSync(local, 'utf8'));
    return Object.fromEntries(Object.entries(data).map(([directory, names]) => [directory, new Set(names)]));
  }

  const directories = ['voice', 'voice_cn', 'voice_custom', 'voice_en', 'voice_kr'];
  const entries = await Promise.all(directories.map(async directory => {
    const response = await fetch(`${AUDIO_DIRECTORY_APIS[directory]}?ref=main`);
    if (!response.ok) throw new Error(`Arkpedia voice assets ${directory}: ${response.status} ${response.statusText}`);
    const listing = await response.json();
    return [directory, new Set(listing.filter(item => item.type === 'dir').map(item => item.name))];
  }));
  return Object.fromEntries(entries);
}

function operatorIds() {
  const ids = new Set();
  for (const dir of readdirSync(join(ROOT, 'data'), { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^operators-\dstar$/.test(dir.name)) continue;
    for (const file of readdirSync(join(ROOT, 'data', dir.name))) {
      if (!file.endsWith('.json')) continue;
      const operator = JSON.parse(readFileSync(join(ROOT, 'data', dir.name, file), 'utf8'));
      if (operator.internalName) ids.add(operator.internalName);
    }
  }
  return ids;
}

const PACK_LABELS = {
  EN: 'English', JP: 'Japanese', KR: 'Korean', CN_MANDARIN: 'Mandarin',
  CN_TOPOLECT: 'Regional Chinese', ITA: 'Italian', GER: 'German', RUS: 'Russian',
  FRE: 'French', 11: 'Spanish', LINKAGE: 'Collaboration',
};

function packId(type) {
  return ({ CN_MANDARIN: 'cn', CN_TOPOLECT: 'cn_topolect', LINKAGE: 'linkage', 11: 'spa' }[type] || String(type).toLowerCase());
}

function audioLocation(charId, type, voicePath) {
  const id = packId(type);
  if (type === 'EN') return { directory: 'voice_en', folder: charId };
  if (type === 'JP') return { directory: 'voice', folder: charId };
  if (type === 'KR') return { directory: 'voice_kr', folder: charId };
  if (type === 'CN_MANDARIN') return { directory: 'voice_cn', folder: charId };
  if (type === 'ITA' || type === 'CN_TOPOLECT') return { directory: 'voice_custom', folder: `${charId}_${id}` };
  if (['GER', 'RUS', 'FRE', '11'].includes(String(type))) return { directory: 'voice_custom', folder: charId };
  if (type === 'LINKAGE') {
    const directory = String(voicePath || '').toLowerCase().includes('cn') ? 'voice_cn' : 'voice';
    return { directory, folder: charId };
  }
  return null;
}

function audioTemplate(charId, type, voicePath, directoryIndex) {
  const location = audioLocation(charId, type, voicePath);
  if (!location || !directoryIndex[location.directory]?.has(location.folder)) return null;
  return `${AUDIO_ROOTS[location.directory]}/${location.folder}/{voiceIdLower}.mp3`;
}

function lineCategory(voiceId) {
  const match = /^CN_(\d+)/.exec(voiceId);
  if (!match) return 'special';
  const number = Number(match[1]);
  if (number >= 17 && number <= 32) return 'combat';
  if (number >= 38) return 'special';
  return 'profile';
}

function wordsFor(table, charId) {
  const byVoice = new Map();
  for (const word of Object.values(table.charWords || {})) {
    if (word.charId !== charId) continue;
    const previous = byVoice.get(word.voiceId);
    if (!previous || (word.wordKey === charId && previous.wordKey !== charId)) byVoice.set(word.voiceId, word);
  }
  for (const word of Object.values(table.charExtraWords || {})) {
    if (word.charId !== charId || byVoice.has(word.voiceId)) continue;
    byVoice.set(word.voiceId, { ...word, voiceTitle: 'Additional voice line', voiceIndex: 1000 });
  }
  return [...byVoice.values()].sort((a, b) => (a.voiceIndex ?? 1000) - (b.voiceIndex ?? 1000) || a.voiceId.localeCompare(b.voiceId));
}

function currentPacks(table, charId, directoryIndex) {
  const config = table.voiceLangDict?.[charId];
  if (!config) return [];
  const order = ['EN', 'JP', 'CN_MANDARIN', 'KR', '11', 'ITA', 'GER', 'RUS', 'FRE', 'CN_TOPOLECT', 'LINKAGE'];
  const rank = new Map(order.map((type, index) => [packId(type), index]));
  return Object.entries(config.dict || {}).map(([type, value]) => ({
    id: packId(type),
    label: PACK_LABELS[type] || table.voiceLangTypeDict?.[type]?.name || type,
    actors: value.cvName || [],
    status: 'current',
    audioTemplate: audioTemplate(charId, type, value.voicePath, directoryIndex),
  })).sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

function readTlvr(directory) {
  const map = new Map();
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    if (data.charid) map.set(data.charid, data);
  }
  return map;
}

function tlvrFallback(data) {
  if (!data) return [];
  return (data.voices || []).map((voice, index) => ({
    id: voice.asset?.split('/').pop() || voice.id.replace(/^.*_(CN_\d+.*)$/, '$1'),
    title: voice.title?.en || voice.title?.cn || 'Voice line',
    text: voice.text?.en || voice.text?.cn || null,
    category: lineCategory(voice.asset?.split('/').pop() || voice.id.replace(/^.*_(CN_\d+.*)$/, '$1')),
    status: 'current',
    unlock: null,
    order: index,
  }));
}

function legacyPacks(data) {
  if (!data) return [];
  return (data.availability || []).filter(id => id.startsWith('old_')).map(id => ({
    id,
    label: `Legacy ${(id.slice(4).toUpperCase())}`,
    actors: data.actors?.[id] ? [data.actors[id].global || data.actors[id].native] : [],
    status: 'legacy',
    audioTemplate: legacyAudioTemplate(data.audio_path_override?.[id], data.charid),
  }));
}

function legacyAudioTemplate(source, charId) {
  const match = String(source || '').match(/^https:\/\/raw\.githubusercontent\.com\/PseudoMon\/arknights-audio\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const sourceDirectory = match[2].split('/')[0];
  const root = LEGACY_AUDIO_ROOTS[sourceDirectory];
  return root ? `${root}/${match[1]}/${charId}/{voiceId}.mp3` : null;
}

function unusedLines(audioIndex, charId, currentIds) {
  const entry = audioIndex.data?.[charId];
  if (!entry) return [];
  const clips = new Map();
  const variationPack = { JP: 'jp', CN: 'cn', KR: 'kr', EN: 'en', CUSTOM: 'custom' };
  for (const [variationId, variation] of Object.entries(entry.variations || {})) {
    for (const clip of variation.clips || []) {
      const packs = clips.get(clip.name) || new Set();
      packs.add(variationPack[variationId] || String(variationId).toLowerCase());
      clips.set(clip.name, packs);
    }
  }
  const titles = audioIndex.localizations?.['en-US'] || {};
  return [...clips.entries()].filter(([id]) => !currentIds.has(id)).sort(([a], [b]) => a.localeCompare(b)).map(([id, packs], index) => {
    const numeric = /^CN_(\d+)/.exec(id)?.[1];
    return {
      id,
      title: (numeric && titles[numeric]) || `Unused recording ${id}`,
      text: null,
      category: 'unused',
      status: 'unused',
      unlock: null,
      order: 2000 + index,
      availablePacks: [...packs].sort(),
    };
  });
}

const [en, cn, audioIndex, directory, audioDirectories] = await Promise.all([
  jsonInput('ARKPEDIA_EN_CHARWORDS', URLS.en),
  jsonInput('ARKPEDIA_CN_CHARWORDS', URLS.cn),
  jsonInput('ARKPEDIA_VOICE_INDEX', URLS.audioIndex),
  tlvrDirectory(),
  audioDirectoryIndex(),
]);
const tlvr = readTlvr(directory);
const operators = {};

for (const charId of [...operatorIds()].sort()) {
  const enWords = wordsFor(en, charId);
  const cnWords = wordsFor(cn, charId);
  const archive = tlvr.get(charId);
  const source = enWords.length ? enWords : cnWords;
  const fallback = source.length ? [] : tlvrFallback(archive);
  const lines = source.map((word, index) => ({
    id: word.voiceId,
    title: word.voiceTitle || 'Additional voice line',
    text: word.voiceText || null,
    category: lineCategory(word.voiceId),
    status: 'current',
    unlock: word.lockDescription || null,
    order: word.voiceIndex ?? index,
  })).concat(fallback);
  const currentIds = new Set(lines.map(line => line.id));
  lines.push(...unusedLines(audioIndex, charId, currentIds));

  const packsById = new Map();
  for (const pack of currentPacks(en, charId, audioDirectories)) packsById.set(pack.id, pack);
  for (const pack of currentPacks(cn, charId, audioDirectories)) {
    const existing = packsById.get(pack.id);
    if (!existing || (!existing.audioTemplate && pack.audioTemplate)) {
      packsById.set(pack.id, { ...pack, actors: existing?.actors?.length ? existing.actors : pack.actors });
    }
  }
  const packs = [...packsById.values()].filter(pack => pack.audioTemplate).concat(legacyPacks(archive));
  if (!packs.length && archive) {
    const audioCharId = archive.voices?.[0]?.asset?.split('/')?.[0] || charId;
    for (const id of archive.availability || []) {
      const type = ({ en: 'EN', jp: 'JP', kr: 'KR', cn: 'CN_MANDARIN' })[id];
      if (!type) continue;
      const template = audioTemplate(audioCharId, type, null, audioDirectories);
      if (template) packs.push({ id, label: PACK_LABELS[type], actors: archive.actors?.[id] ? [archive.actors[id].global || archive.actors[id].native] : [], status: 'current', audioTemplate: template });
    }
  }
  if (lines.length) operators[charId] = { textLocale: enWords.length || fallback.length ? 'en' : 'zh-CN', lines, packs };
}

writeFileSync(OUTPUT, `${JSON.stringify({
  meta: {
    transcripts: [URLS.en, URLS.cn],
    audio: AUDIO_ROOTS,
    legacyAudio: LEGACY_AUDIO_ROOTS,
    archive: 'https://github.com/PseudoMon/tlvr-source',
    unusedIndex: URLS.audioIndex,
  },
  operators,
}, null, 2)}\n`);

if (!process.env.ARKPEDIA_TLVR_DIR) rmSync(directory.replace(/\/tlvr-source-master\/datascript\/chardata$/, ''), { recursive: true, force: true });
console.log(`Wrote ${Object.keys(operators).length} operators to ${basename(OUTPUT)}`);
