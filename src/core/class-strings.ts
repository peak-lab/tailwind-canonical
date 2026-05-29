export type ClassStringOpts = {
  functionNames?: string[];
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function transformCallContent(
  content: string,
  start: number,
  transform: (s: string) => string,
): { processed: string; consumed: number; count: number } {
  const parts: string[] = [];
  let i = start;
  let depth = 1;
  let count = 0;

  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      parts.push(ch);
      i++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      parts.push(ch);
      i++;
    } else if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < content.length && content[j] !== q) {
        if (content[j] === '\\') j++;
        j++;
      }
      const raw = content.slice(i + 1, j);
      const out = transform(raw);
      if (out !== raw) count++;
      parts.push(`${q}${out}${q}`);
      i = j + 1;
    } else {
      parts.push(ch);
      i++;
    }
  }

  return { processed: parts.join(''), consumed: i - start, count };
}

export function replaceClassStrings(
  content: string,
  transform: (s: string) => string,
  opts: ClassStringOpts = {},
): { result: string; count: number } {
  let result = content;
  let count = 0;

  result = result.replace(
    /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g,
    (_full, dq, sq, bt) => {
      const raw = dq ?? sq ?? bt ?? '';
      const q = dq !== undefined ? '"' : sq !== undefined ? "'" : '`';
      const out = transform(raw);
      if (out !== raw) count++;
      return `className=${q}${out}${q}`;
    },
  );

  const funcNames = opts.functionNames;
  if (!funcNames?.length) return { result, count };

  const funcRe = new RegExp(
    `\\b(?:${funcNames.map(escapeRegex).join('|')})\\s*\\(`,
    'g',
  );
  const buf: string[] = [];
  let pos = 0;

  for (const m of result.matchAll(funcRe)) {
    const callStart = (m.index ?? 0) + m[0].length;
    if (callStart < pos) continue;
    buf.push(result.slice(pos, callStart));
    const {
      processed,
      consumed,
      count: c,
    } = transformCallContent(result, callStart, transform);
    buf.push(processed);
    pos = callStart + consumed;
    count += c;
    funcRe.lastIndex = pos;
  }
  buf.push(result.slice(pos));

  return { result: buf.join(''), count };
}

export function extractClassStrings(
  content: string,
  opts: ClassStringOpts = {},
): Array<{ value: string; start: number; end: number }> {
  const results: Array<{ value: string; start: number; end: number }> = [];

  for (const m of content.matchAll(
    /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g,
  )) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    const start = (m.index ?? 0) + m[0].length - raw.length - 1;
    results.push({ value: raw, start, end: start + raw.length });
  }

  const funcNames = opts.functionNames;
  if (!funcNames?.length) return results;

  const funcRe = new RegExp(
    `\\b(?:${funcNames.map(escapeRegex).join('|')})\\s*\\(`,
    'g',
  );

  for (const m of content.matchAll(funcRe)) {
    let i = (m.index ?? 0) + m[0].length;
    let depth = 1;
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
        i++;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        i++;
      } else if (ch === '"' || ch === "'") {
        const q = ch;
        let j = i + 1;
        while (j < content.length && content[j] !== q) {
          if (content[j] === '\\') j++;
          j++;
        }
        results.push({ value: content.slice(i + 1, j), start: i + 1, end: j });
        i = j + 1;
      } else {
        i++;
      }
    }
  }

  return results;
}
