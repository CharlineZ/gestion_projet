import mammoth from 'mammoth';

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#\d+;/g, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tablesToText(html: string): string {
  const out: string[] = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(html))) {
    const rows: string[][] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tableMatch[1]))) {
      const cells: string[] = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(rowMatch[1]))) {
        cells.push(stripTags(cellMatch[1]));
      }
      if (cells.some((c) => c)) rows.push(cells);
    }
    if (rows.length < 2) continue;
    const headers = rows[0];
    out.push('TABLEAU (1re ligne = en-têtes) :');
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i]
        .map((c, j) => (c ? (headers[j] && headers[j] !== c ? `${headers[j]}: ${c}` : c) : ''))
        .filter(Boolean);
      if (cells.length) out.push(`- ${cells.join(' | ')}`);
    }
  }
  return out.join('\n');
}

export async function docxToText(buffer: Buffer): Promise<string> {
  const raw = await mammoth.extractRawText({ buffer });
  const html = await mammoth.convertToHtml({ buffer });
  const tables = tablesToText(html.value);
  const text = [raw.value.trim(), tables].filter(Boolean).join('\n\n');
  if (!text) throw new Error('Aucun texte exploitable extrait du document Word.');
  return text;
}
