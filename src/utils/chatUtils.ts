import { CHAT_TEXT } from '../constants/textConstants';
import { ChartContent } from '../types/chart';

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

const getChartRows = (chartSpec: unknown): Record<string, unknown>[] => {
  if (Array.isArray(chartSpec)) {
    return chartSpec.filter((row): row is Record<string, unknown> =>
      row !== null &&
      typeof row === 'object' &&
      Object.keys(row).length > 0
    );
  }

  const spec = chartSpec as any;
  const rows = Array.isArray(spec?.data?.values)
    ? spec.data.values
    : (Array.isArray(spec?.data) ? spec.data : []);

  return rows.filter((row: unknown): row is Record<string, unknown> =>
    row !== null &&
    typeof row === 'object' &&
    Object.keys(row).length > 0
  );
};

const isNumericLike = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const normalized = value.replace(/,/g, '').replace(/[%$]/g, '').trim();
  return /^-?\d+(?:\.\d+)?$/.test(normalized);
};

const hasNumericMeasure = (rows: Record<string, unknown>[]): boolean => {
  const excluded = /^(id|name|label|key|zip|zipcode|zip_code|postal|postal_code)$/i;
  return rows.some(row =>
    Object.entries(row).some(([key, value]) => !excluded.test(key) && isNumericLike(value))
  );
};

export const hasUsableChartData = (chartSpec: unknown): boolean => {
  const rows = getChartRows(chartSpec);
  return rows.length > 0 && hasNumericMeasure(rows);
};

const parseNumericCell = (cell: string): number | null => {
  const compactRange = cell.match(/~?\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*[–-]\s*-?\d/);
  const normalized = (compactRange?.[1] ?? cell)
    .replace(/,/g, '')
    .replace(/[%$]/g, '')
    .trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
};

const isTimeLikeHeader = (header: string): boolean =>
  /\b(period|month|date|time|year|quarter|week|day)\b/i.test(header);

export const buildChartFromMarkdownTable = (text: string): ChartContent | null => {
  const table = parseMarkdownTable(text);
  if (!table || table.rows.length < 2) return null;

  const xIndex =
    table.headers.findIndex(isTimeLikeHeader) >= 0
      ? table.headers.findIndex(isTimeLikeHeader)
      : 0;

  const numericColumns = table.headers
    .map((header, index) => ({ header, index }))
    .filter(({ index }) => index !== xIndex)
    .map(({ header, index }) => {
      const values = table.rows.map(row => parseNumericCell(row[index] ?? ''));
      const validCount = values.filter(value => value !== null).length;
      return { header, index, validCount };
    })
    .filter(column => column.validCount >= Math.max(2, Math.ceil(table.rows.length * 0.6)))
    .slice(0, 4);

  if (numericColumns.length === 0) return null;

  const data = table.rows
    .map(row => {
      const label = row[xIndex]?.trim();
      if (!label) return null;

      const point: Record<string, string | number> = {
        [table.headers[xIndex]]: label,
        name: label,
      };

      numericColumns.forEach(({ header, index }) => {
        const value = parseNumericCell(row[index] ?? '');
        if (value !== null) point[header] = value;
      });

      return numericColumns.some(({ header }) => typeof point[header] === 'number') ? point : null;
    })
    .filter((row): row is Record<string, string | number> => row !== null);

  if (data.length < 2) return null;

  return {
    type: 'generic',
    chart_spec: {
      type: isTimeLikeHeader(table.headers[xIndex]) ? 'line' : 'bar',
      title: 'Trend Visualization',
      data,
    },
  };
};

export const buildTableFromChartContent = (charts: ChartContent[]): ParsedTable | null => {
  const chart = charts.find(item => hasUsableChartData(item.chart_spec));
  if (!chart) return null;

  const rows = getChartRows(chart.chart_spec);
  if (rows.length === 0) return null;

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach(key => {
        if (key !== 'id') set.add(key);
      });
      return set;
    }, new Set<string>())
  );

  if (headers.length === 0) return null;

  const tableRows = rows
    .map(row => headers.map(header => String(row[header] ?? '').trim()))
    .filter(row => row.some(cell => cell.length > 0));

  return tableRows.length > 0 ? { headers, rows: tableRows } : null;
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
