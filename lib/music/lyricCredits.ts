/** Credit labels seen in the catalogue's opening LRC blocks. Only the leading
 * block is removed: later sung lines may contain a colon or these same words. */
const CREDIT_ROLE = /作曲|作词|词曲|^词$|^曲$|^OP$|^SP$|编曲|制作人|录音|混音|母带|演唱|歌手|主唱|领唱|合唱|和声|吉他|贝斯|鼓|弦乐|大提琴|音乐设计|音乐制作|监制|乐器|Composer|Composed|Arrang|Produc|Director|Perform|Vocal|Lyric|Songwriter|Recording|Mixing|Mastering|Guitar|Bass|Drums|Strings|Chorus|Instrument/i;
const CREDIT_PREAMBLE = /^(?:Presented by .+|(?:Music and Lyrics|Vocals|Words and Music) by .+)$/i;

export function isLyricCredit(text: string): boolean {
  if (!text || CREDIT_PREAMBLE.test(text)) return true;
  const label = text.match(/^(.{1,44}?)\s*[:：]\s*\S/);
  return Boolean(label && CREDIT_ROLE.test(label[1]));
}

/** Also repairs lyric arrays from releases published before a new label was known. */
export function stripLyricCredits<T extends { text: string }>(lines: T[]): T[] {
  const first = lines.findIndex(line => !isLyricCredit(line.text));
  return first < 0 ? [] : first === 0 ? lines : lines.slice(first);
}
