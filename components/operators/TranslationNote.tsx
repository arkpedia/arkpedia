/** Inspect the affected text, not just the operator's release region. */
export default function TranslationNote({ region, credit, text }: { region?: 'CN' | 'Global'; credit?: string; text: unknown }) {
  if (region !== 'CN' && !credit) return null;
  const content = JSON.stringify(text, (key, value) => key === 'icon' || key === 'rawName' ? undefined : value) ?? '';
  if (!content || content === 'null') return null;
  const incomplete = /\p{Script=Han}/u.test(content);
  return <p className="hint">{incomplete ? 'English translation incomplete' : 'Unofficial fan translation'} · <a href="https://github.com/ArknightsAssets/ArknightsGamedata/tree/master/cn/gamedata/excel" target="_blank" rel="noopener noreferrer">from CN game data ↗</a>
    {credit ? ` · Supplement: ${credit}` : incomplete ? '' : ' · Translator uncredited'}</p>;
}
