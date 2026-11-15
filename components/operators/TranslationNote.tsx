/** Attribution stays visible beside CN mechanics, including compact previews. */
export default function TranslationNote({ region, credit }: { region?: 'CN' | 'Global'; credit?: string }) {
  if (region !== 'CN') return null;
  return <p className="hint">Unofficial fan translation · <a href="https://github.com/ArknightsAssets/ArknightsGamedata/tree/master/cn/gamedata/excel" target="_blank" rel="noopener noreferrer">from CN game data ↗</a>
    {credit ? ` · Supplement: ${credit}` : ' · Translator uncredited'}</p>;
}
