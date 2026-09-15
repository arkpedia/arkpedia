/** Read RFC 4180 CSV, including quoted newlines, escaped quotes and a UTF-8 BOM. */
export function readCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += ch;
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(field); field = ''; closed = false;
      if (ch !== ',') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        rows.push(row); row = [];
      }
    } else if (ch === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error('Malformed CSV quoting');
      field += ch;
    }
  }
  if (quoted) throw new Error('Unterminated CSV field');
  if (field || row.length || closed) rows.push([...row, field]);
  const headers = rows.shift();
  if (!headers || new Set(headers).size !== headers.length) throw new Error('Missing or duplicate CSV headers');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2}: expected ${headers.length} fields, found ${values.length}`);
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}
