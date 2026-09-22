/** Learn actor spellings from the same operator and recording language across regions. */
export function actorAliases(cn, globalTables) {
  const aliases = new Map();
  for (const global of globalTables) for (const [id, config] of Object.entries(global.voiceLangDict ?? {})) {
    for (const [type, voice] of Object.entries(config.dict ?? {})) {
      const native = cn.voiceLangDict?.[id]?.dict?.[type]?.cvName?.map(name => name.trim()) ?? [];
      const translated = voice.cvName?.map(name => name.trim()) ?? [];
      if (native.length !== 1 || translated.length !== 1 || native[0] === translated[0]) continue;
      const key = `${type}:${native[0]}`;
      const previous = aliases.get(key);
      aliases.set(key, previous === undefined || previous === translated[0] ? translated[0] : null);
    }
  }
  return aliases;
}

export function normalizeVoicePack(pack, aliases) {
  const recording = pack.audioTemplate?.match(/arkpedia-voice-(japanese|english|mandarin|korean)\//)?.[1];
  const language = { japanese: ['JP', 'Japanese'], english: ['EN', 'English'], mandarin: ['CN_MANDARIN', 'Mandarin'], korean: ['KR', 'Korean'] }[recording];
  const type = { jp: 'JP', en: 'EN', cn: 'CN_MANDARIN', kr: 'KR' }[pack.id] ?? (pack.id === 'linkage' ? language?.[0] : null);
  return {
    ...pack,
    label: pack.id === 'linkage' && language ? language[1] : pack.label,
    actors: pack.actors.map(actor => aliases.get(`${type}:${actor.trim()}`) || actor.trim()),
  };
}
