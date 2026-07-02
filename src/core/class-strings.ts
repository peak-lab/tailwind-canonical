import { lineAt } from './suppressions.js';

export type ClassStringOpts = {
  functionNames?: string[];
  attributeNames?: string[];
  isSuppressed?: (line: number) => boolean;
};

/** Builds the shared {functionNames, attributeNames} extraction options from a config. */
export function toClassStringOpts(config: {
  functionNames?: string[];
  attributeNames?: string[];
}): ClassStringOpts {
  return {
    functionNames: config.functionNames,
    attributeNames: config.attributeNames,
  };
}

const DEFAULT_ATTR_NAMES = ['className'];

export const SINGLE_CLASS_REGEX = /[^\s"'`{}]+/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAttrRegex(names: string[]): RegExp {
  const alts = names.map(escapeRegex).join('|');
  return new RegExp(
    `(^|[^\\w:$-])(${alts})\\s*=\\s*(?:({)(?:"([^"]+)"|'([^']+)'|\`([^\`]+)\`)(})|(?:"([^"]+)"|'([^']+)'|\`([^\`]+)\`))`,
    'g',
  );
}

type StringRange = { value: string; start: number; end: number };

function readQuotedString(
  content: string,
  quoteStart: number,
): (StringRange & { next: number }) | null {
  const quote = content[quoteStart];
  let quoteEnd = quoteStart + 1;
  while (quoteEnd < content.length && content[quoteEnd] !== quote) {
    if (content[quoteEnd] === '\\') quoteEnd++;
    quoteEnd++;
  }
  if (quoteEnd >= content.length) return null;
  return {
    value: content.slice(quoteStart + 1, quoteEnd),
    start: quoteStart + 1,
    end: quoteEnd,
    next: quoteEnd + 1,
  };
}

function scanCallStrings(
  content: string,
  start: number,
): { strings: StringRange[]; consumed: number; complete: boolean } {
  const strings: StringRange[] = [];
  let i = start;
  let depth = 1;

  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      i++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      i++;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const quoted = readQuotedString(content, i);
      if (!quoted) {
        return {
          strings: [],
          consumed: content.length - start,
          complete: false,
        };
      }
      strings.push(quoted);
      i = quoted.next;
    } else {
      i++;
    }
  }

  return { strings, consumed: i - start, complete: depth === 0 };
}

function transformCallContent(
  content: string,
  start: number,
  transform: (s: string) => string,
  isSuppressed?: (line: number) => boolean,
): { processed: string; consumed: number; count: number } {
  const scanned = scanCallStrings(content, start);
  const original = content.slice(start, start + scanned.consumed);
  if (!scanned.complete) {
    return { processed: original, consumed: scanned.consumed, count: 0 };
  }

  const parts: string[] = [];
  let pos = start;
  let count = 0;

  for (const string of scanned.strings) {
    parts.push(content.slice(pos, string.start));
    const out = isSuppressed?.(lineAt(content, string.start - 1))
      ? string.value
      : transform(string.value);
    if (out !== string.value) count++;
    parts.push(out);
    pos = string.end;
  }
  parts.push(content.slice(pos, start + scanned.consumed));

  return { processed: parts.join(''), consumed: scanned.consumed, count };
}

export function replaceClassStrings(
  content: string,
  transform: (s: string) => string,
  opts: ClassStringOpts = {},
): { result: string; count: number } {
  const attrNames = opts.attributeNames?.length
    ? opts.attributeNames
    : DEFAULT_ATTR_NAMES;
  let result = content;
  let count = 0;

  const isSuppressed = opts.isSuppressed;

  result = result.replace(
    buildAttrRegex(attrNames),
    (
      _full,
      before,
      attr,
      open,
      bracedDq,
      bracedSq,
      bracedBt,
      close,
      dq,
      sq,
      bt,
      offset: number,
    ) => {
      const raw = bracedDq ?? bracedSq ?? bracedBt ?? dq ?? sq ?? bt ?? '';
      const q =
        bracedDq !== undefined || dq !== undefined
          ? '"'
          : bracedSq !== undefined || sq !== undefined
            ? "'"
            : '`';
      const attrOffset = offset + before.length;
      const out = isSuppressed?.(lineAt(content, attrOffset))
        ? raw
        : transform(raw);
      if (out !== raw) count++;
      return `${before}${attr}=${open ?? ''}${q}${out}${q}${close ?? ''}`;
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
    } = transformCallContent(result, callStart, transform, isSuppressed);
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
  const attrNames = opts.attributeNames?.length
    ? opts.attributeNames
    : DEFAULT_ATTR_NAMES;
  const results: Array<{ value: string; start: number; end: number }> = [];

  for (const m of content.matchAll(buildAttrRegex(attrNames))) {
    const raw = m[4] ?? m[5] ?? m[6] ?? m[8] ?? m[9] ?? m[10] ?? '';
    const start = (m.index ?? 0) + m[0].lastIndexOf(raw);
    results.push({ value: raw, start, end: start + raw.length });
  }

  const funcNames = opts.functionNames;
  if (!funcNames?.length) return results;

  const funcRe = new RegExp(
    `\\b(?:${funcNames.map(escapeRegex).join('|')})\\s*\\(`,
    'g',
  );

  for (const m of content.matchAll(funcRe)) {
    const start = (m.index ?? 0) + m[0].length;
    results.push(...scanCallStrings(content, start).strings);
  }

  return results;
}
