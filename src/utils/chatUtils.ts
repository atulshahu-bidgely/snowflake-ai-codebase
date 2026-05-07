import { CHAT_TEXT } from '../constants/textConstants';

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

const parseRow = (line: string): string[] =>
  line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

// Cells with no digits and avg >2 words per cell are likely column-description rows injected by LLMs
const isDescriptionRow = (row: string[]): boolean => {
  if (row.every(cell => !/\d/.test(cell))) {
    const avgWords = row.reduce((sum, cell) => sum + cell.split(/\s+/).filter(Boolean).length, 0) / row.length;
    return avgWords > 2;
  }
  return false;
};

// Parse every markdown table in the text, then return the one most likely to be
// actual data: ranked by column count (more columns = richer data table), then by
// row count. This ensures a full "Asset Reference Table" beats a 2-column
// "Pattern | Observation" summary that appears earlier in the response.
export const parseMarkdownTable = (text: string): ParsedTable | null => {
  const lines = text.split('\n');
  const tables: ParsedTable[] = [];

  let i = 0;
  while (i < lines.length - 1) {
    const line = lines[i].trim();
    if (/^\|.+\|$/.test(line) && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const headers = parseRow(line);
      const allRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        allRows.push(parseRow(lines[j].trim()));
        j++;
      }
      const firstDataIdx = allRows.findIndex(row => !isDescriptionRow(row));
      const rows = firstDataIdx === -1 ? [] : allRows.slice(firstDataIdx);
      if (headers.length > 0 && rows.length > 0) tables.push({ headers, rows });
      i = j;
    } else {
      i++;
    }
  }

  if (tables.length === 0) return null;

  // Pick the table with the most columns; break ties by most rows
  return tables.reduce((best, t) =>
    t.headers.length > best.headers.length ||
    (t.headers.length === best.headers.length && t.rows.length > best.rows.length)
      ? t : best
  );
};

// Extracts the first large number from the response text that likely represents the total matched count.
// e.g. "2,767 residential AMI customers" or "found 3,000 customers" → 2767 / 3000
export const extractTotalCount = (text: string): number | undefined => {
  const match = text.match(/\b([1-9]\d{2,3}(?:,\d{3})*)\b/);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : undefined;
};

const splitThinkingTextIntoParagraphs = (text: string): string[] => {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += 3) {
    const p = sentences.slice(i, i + 3).join(' ');
    if (p.trim()) paragraphs.push(p);
  }
  return paragraphs.length > 0 ? paragraphs : [text.trim()].filter(Boolean);
};

export const extractThinkingPreview = (texts: string[]): string[] => {
  const combined = texts.filter(t => t.trim()).join('\n\n');
  if (!combined.trim()) return [];

  let chunks = combined
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 20);

  if (chunks.length <= 1) chunks = splitThinkingTextIntoParagraphs(combined);

  const isTechnical = (p: string) => {
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|FROM|WHERE)\b/i.test(p)) return true;
    const words = p.split(/\s+/);
    return words.filter(w => /^[A-Z][A-Z_0-9]{2,}$/.test(w)).length / words.length > 0.4;
  };

  const cleanText = (p: string) =>
    p
      .replace(/`[^`]+`/g, '')
      .replace(/\b[A-Z][A-Z_0-9]{2,}\b/g, '')
      .replace(/\w+\s*[=><!]+\s*['"]?\w+['"]?/g, '')
      .replace(/\b(SELECT|FROM|WHERE|JOIN|WITH|AND|OR|HAVING|GROUP BY|ORDER BY)\b\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const score = (p: string) => {
    let s = 0;
    if (/\b(analyz|calculat|comput|find|check|compar|determin|identif|look|retriev|aggregat)\w*/i.test(p)) s += 3;
    if (/\b(customer|consumption|segment|territory|usage|rate|program|EV|solar|residential|commercial|peak|demand|period|month|year|quarter)\b/i.test(p)) s += 3;
    if (/\b(because|since|therefore|however|first|then|next|finally|need to|want to|should|will)\b/i.test(p)) s += 2;
    s += Math.min(p.length / 60, 4);
    if (p.length < 40) s -= 2;
    if (/^(okay|ok|let me|i will|i'll|sure|alright|so,)/i.test(p)) s -= 2;
    return s;
  };

  const candidates = chunks
    .filter(p => !isTechnical(p))
    .map((text, index) => ({ text: cleanText(text), index, score: score(text) }))
    .filter(c => c.text.length > 20);

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map(c => c.text);
};

export const extractSqlQuery = (data: any): string | null => {
  try {
    if (data?.content) {
      for (const item of data.content) {
        if (item?.json?.sql) return item.json.sql.trim();
      }
    }
    if (data?.sql) return data.sql.trim();
    if (data?.text?.includes('SELECT')) {
      const m = data.text.match(/SELECT[\s\S]*?;/i);
      return m ? m[0].trim() : null;
    }
    return null;
  } catch {
    return null;
  }
};

export const extractVerificationInfo = (data: any) => {
  try {
    const verification: any = {};
    const pick = (src: any) => {
      const keys = ['verification', 'validated', 'query_verified', 'verified_query_used', 'query_validation'];
      keys.forEach(k => { if (src[k] !== undefined) verification[k] = src[k]; });
    };
    if (data?.content) {
      for (const item of data.content) {
        if (item?.json) pick(item.json);
      }
    }
    pick(data ?? {});
    return Object.keys(verification).length > 0 ? verification : null;
  } catch {
    return null;
  }
};

export const getTimeBasedGreeting = (): string => {
  const hour = new Date().getHours();
  const rand = (opts: string[]) => opts[Math.floor(Math.random() * opts.length)];
  if (hour < 12) return rand(CHAT_TEXT.GREETINGS.MORNING);
  if (hour < 17) return rand(CHAT_TEXT.GREETINGS.AFTERNOON);
  if (hour < 22) return rand(CHAT_TEXT.GREETINGS.EVENING);
  return rand(CHAT_TEXT.GREETINGS.NIGHT);
};

export const formatTimestamp = (date: Date): string => new Date(date).toLocaleTimeString();

export const formatDate = (date: Date): string =>
  new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export const formatTime = (date: Date): string =>
  new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });


