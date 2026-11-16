/** Source credits use revision-pinned HTTPS wiki links; render text safely as React children. */
function SourceCredit({ credit }: { credit: string }) {
  return credit.split(/(\[https:\/\/arknights\.wiki\.gg\/[^\]]+\])/g).map((part, index) =>
    /^\[https:\/\/arknights\.wiki\.gg\//.test(part)
      ? <a key={index} href={part.slice(1, -1)} target="_blank" rel="noopener noreferrer">source ↗</a>
      : part,
  );
}

/** Inspect the affected text, not just the operator's release region. */
export default function TranslationNote({ region, credit, text }: { region?: 'CN' | 'Global'; credit?: string; text: unknown }) {
  if (region !== 'CN' && !credit) return null;
  const content = JSON.stringify(text, (key, value) => key === 'icon' || key === 'rawName' ? undefined : value) ?? '';
  if (!content || content === 'null') return null;
  const incomplete = /\p{Script=Han}/u.test(content);
  return <p className="hint">{incomplete ? 'English translation incomplete' : 'Unofficial fan translation'} · <a href="https://github.com/ArknightsAssets/ArknightsGamedata/tree/master/cn/gamedata/excel" target="_blank" rel="noopener noreferrer">from CN game data ↗</a>
    {credit ? <> · Supplement: <SourceCredit credit={credit} /></> : incomplete ? '' : ' · Translator uncredited'}</p>;
}
