import { createPositionLookup } from './suppressions.js';

export type ClassStringOpts = {
  functionNames?: string[];
  attributeNames?: string[];
  customTextTokens?: Record<number, string>;
  tailwindVersion?: 3 | 4;
  isSuppressed?: (line: number) => boolean;
};

/** Builds the shared {functionNames, attributeNames} extraction options from a config. */
export function toClassStringOpts(config: {
  functionNames?: string[];
  attributeNames?: string[];
  customTextTokens?: Record<number, string>;
  tailwindVersion?: 3 | 4;
}): ClassStringOpts {
  return {
    functionNames: config.functionNames,
    attributeNames: config.attributeNames,
    customTextTokens: config.customTextTokens,
    tailwindVersion: config.tailwindVersion,
  };
}

const DEFAULT_ATTR_NAMES = ['className'];

export const SINGLE_CLASS_REGEX = /\S+/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAttrRegex(names: string[]): RegExp {
  const alts = names.map(escapeRegex).join('|');
  return new RegExp(`(^|[^\\w:$-])(${alts})\\s*=\\s*`, 'g');
}

type StringRange = {
  value: string;
  start: number;
  end: number;
  /** Quoted markup attributes can contain Svelte-style {expression} holes. */
  braceExpressions?: boolean;
};

function attributeStrings(
  content: string,
  names: string[],
  functionNames: string[] = [],
): Array<StringRange & { attributeStart: number }> {
  const result: Array<StringRange & { attributeStart: number }> = [];
  for (const match of content.matchAll(buildAttrRegex(names))) {
    const attributeStart = (match.index ?? 0) + match[1].length;
    const start = (match.index ?? 0) + match[0].length;
    if (content[start] === '{') {
      const expression = readCallTokens(content, start + 1, '}');
      if (expression.complete) {
        result.push(
          ...classExpression(expression.tokens, functionNames).map(
            (string) => ({ ...string, attributeStart }),
          ),
        );
      }
      continue;
    }
    if (!['"', "'", '`'].includes(content[start])) continue;
    const quoted = readQuotedString(content, start);
    if (!quoted) continue;
    if (match[2].startsWith(':') || match[2].startsWith('v-bind:')) {
      // Vue bindings contain JavaScript, not a class list. Entities require an
      // HTML decoder/source map, so leave those expressions intact for now.
      if (/&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(quoted.value)) continue;
      const expression = readCallTokens(content, quoted.start, content[start]);
      if (expression.complete && expression.next === quoted.next) {
        result.push(
          ...classExpression(expression.tokens, functionNames).map(
            (string) => ({ ...string, attributeStart }),
          ),
        );
      }
    } else result.push({ ...quoted, attributeStart, braceExpressions: true });
  }
  return result;
}

// A template expression is JavaScript, never a class list. Keep its adjacent
// token fragments as well: `text-[12px]${suffix}` is not a static class.
function interpolationEnd(
  content: string,
  start: number,
  openingLength = 2,
): number {
  let depth = 1;
  let i = start + openingLength;
  while (i < content.length) {
    const ch = content[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quoted = readQuotedString(content, i);
      if (!quoted) return content.length;
      i = quoted.next;
    } else if (content.startsWith('//', i)) {
      const end = content.indexOf('\n', i + 2);
      i = end < 0 ? content.length : end;
    } else if (content.startsWith('/*', i)) {
      const end = content.indexOf('*/', i + 2);
      i = end < 0 ? content.length : end + 2;
    } else if (ch === '/') {
      const preceding = previousToken(content, i);
      if (regexMayStart(preceding)) {
        const end = readRegex(content, i);
        if (!end) return content.length;
        i = end;
      } else i++;
    } else {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return i + 1;
      i++;
    }
  }
  return content.length;
}

function staticClassRanges(
  value: string,
  braceExpressions = false,
): StringRange[] {
  const ranges: StringRange[] = [];
  let start = 0;
  let i = 0;
  let bracketDepth = 0;
  while (i < value.length) {
    let escapes = 0;
    for (let j = i - 1; j >= 0 && value[j] === '\\'; j--) escapes++;
    const openingLength = value.startsWith('${', i)
      ? 2
      : braceExpressions && bracketDepth === 0 && value[i] === '{'
        ? 1
        : 0;
    if (!openingLength || escapes % 2 === 1) {
      if (escapes % 2 === 0) {
        if (value[i] === '[') bracketDepth++;
        else if (value[i] === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      }
      i++;
      continue;
    }
    let before = i;
    while (before > start && !/\s/.test(value[before - 1])) before--;
    if (before > start)
      ranges.push({ value: value.slice(start, before), start, end: before });
    i = interpolationEnd(value, i, openingLength);
    while (i < value.length && !/\s/.test(value[i])) i++;
    start = i;
  }
  if (start < value.length)
    ranges.push({ value: value.slice(start), start, end: value.length });
  return ranges;
}

function transformStaticClasses(
  value: string,
  transform: (s: string) => string,
  isSuppressedAt?: (offset: number) => boolean,
  offset = 0,
  braceExpressions = false,
): string {
  const suppressed: Array<{ start: number; end: number }> = [];
  if (isSuppressedAt) {
    let lineStart = 0;
    while (lineStart < value.length) {
      const newline = value.indexOf('\n', lineStart);
      const end = newline < 0 ? value.length : newline + 1;
      if (isSuppressedAt(offset + lineStart))
        suppressed.push({ start: lineStart, end });
      lineStart = end;
    }
  }
  const ranges = staticClassRanges(value, braceExpressions).flatMap((range) => {
    const safe: StringRange[] = [];
    let start = range.start;
    for (const line of suppressed) {
      if (line.end <= start || line.start >= range.end) continue;
      if (line.start > start)
        safe.push({
          value: value.slice(start, line.start),
          start,
          end: line.start,
        });
      start = Math.max(start, line.end);
    }
    if (start < range.end)
      safe.push({
        value: value.slice(start, range.end),
        start,
        end: range.end,
      });
    return safe;
  });
  const preserveEdges =
    value.includes('${') ||
    (braceExpressions && value.includes('{')) ||
    suppressed.length > 0;
  let out = '';
  let pos = 0;
  for (const range of ranges) {
    const segment = range.value;
    if (!segment.trim()) {
      out += value.slice(pos, range.end);
      pos = range.end;
      continue;
    }
    const leading = preserveEdges ? (segment.match(/^\s*/)?.[0] ?? '') : '';
    const trailing = preserveEdges ? (segment.match(/\s*$/)?.[0] ?? '') : '';
    const inner = segment.slice(
      leading.length,
      segment.length - trailing.length,
    );
    out +=
      value.slice(pos, range.start) +
      leading +
      (inner ? transform(inner) : '') +
      trailing;
    pos = range.end;
  }
  return out + value.slice(pos);
}

function readQuotedString(
  content: string,
  quoteStart: number,
): (StringRange & { next: number }) | null {
  const quote = content[quoteStart];
  let quoteEnd = quoteStart + 1;
  while (quoteEnd < content.length && content[quoteEnd] !== quote) {
    if (content[quoteEnd] === '\\') quoteEnd += 2;
    else if (quote === '`' && content.startsWith('${', quoteEnd)) {
      quoteEnd = interpolationEnd(content, quoteEnd);
    } else quoteEnd++;
  }
  if (quoteEnd >= content.length) return null;
  return {
    value: content.slice(quoteStart + 1, quoteEnd),
    start: quoteStart + 1,
    end: quoteEnd,
    next: quoteEnd + 1,
  };
}

type CallToken = {
  text: string;
  string?: StringRange;
  children?: CallToken[];
};

function readRegex(content: string, start: number): number | null {
  let bracket = false;
  for (let i = start + 1; i < content.length && content[i] !== '\n'; i++) {
    const ch = content[i];
    if (ch === '\\') i++;
    else if (ch === '[') bracket = true;
    else if (ch === ']') bracket = false;
    else if (ch === '/' && !bracket) {
      i++;
      while (/[a-z]/i.test(content[i] ?? '') && i < content.length) i++;
      return i;
    }
  }
  return null;
}

const REGEX_PREFIX_TOKENS = new Set([
  ',',
  ':',
  '?',
  '=',
  '!',
  '(',
  '[',
  '{',
  ';',
  '&',
  '|',
  '=>',
  '&&',
  '||',
  '??',
  '+',
  '-',
  '*',
  '/',
  '%',
  '>',
  '<',
  '^',
  '~',
  '==',
  '===',
  '!=',
  '!==',
  '<=',
  '>=',
  'return',
  'throw',
  'case',
  'typeof',
  'void',
  'delete',
  'yield',
  'await',
  'in',
  'instanceof',
  'else',
  'do',
  'new',
  'of',
  // A slash after a statement block may open a regex. Treat a valid-looking
  // literal conservatively even when an object/division expression is ambiguous.
  '}',
]);

// Read only the token immediately before an offset. Searching an entire source
// prefix with an end-anchored regexp once per helper call is quadratic.
function previousToken(content: string, offset: number): string | undefined {
  let end = offset;
  while (end > 0 && /\s/.test(content[end - 1])) end--;
  if (end === 0) return undefined;
  let start = end;
  while (start > 0 && /[\w$]/.test(content[start - 1])) start--;
  if (start < end) return content.slice(start, end);
  const pair = content.slice(Math.max(0, end - 2), end);
  if (['=>', '&&', '||', '??'].includes(pair)) return pair;
  return content[end - 1];
}

function regexMayStart(previous: string | undefined): boolean {
  return previous === undefined || REGEX_PREFIX_TOKENS.has(previous);
}

// Delimiter groups are enough to identify static class positions. This does
// not evaluate expressions or interpret arbitrary JavaScript as a class list.
function readCallTokens(
  content: string,
  start: number,
  closing = ')',
): {
  tokens: CallToken[];
  next: number;
  complete: boolean;
} {
  const tokens: CallToken[] = [];
  let i = start;
  while (i < content.length) {
    const ch = content[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (content.startsWith('//', i)) {
      const end = content.indexOf('\n', i + 2);
      i = end < 0 ? content.length : end;
      continue;
    }
    if (content.startsWith('/*', i)) {
      const end = content.indexOf('*/', i + 2);
      if (end < 0) return { tokens: [], next: content.length, complete: false };
      i = end + 2;
      continue;
    }
    if (ch === closing) return { tokens, next: i + 1, complete: true };
    if (ch === ')' || ch === ']' || ch === '}')
      return { tokens: [], next: i + 1, complete: false };
    if (ch === '"' || ch === "'" || ch === '`') {
      const quoted = readQuotedString(content, i);
      if (!quoted) return { tokens: [], next: content.length, complete: false };
      tokens.push({ text: content.slice(i, quoted.next), string: quoted });
      i = quoted.next;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      const end = { '(': ')', '[': ']', '{': '}' }[ch];
      const group = readCallTokens(content, i + 1, end);
      if (!group.complete)
        return { tokens: [], next: group.next, complete: false };
      tokens.push({ text: ch, children: group.tokens });
      i = group.next;
      continue;
    }
    if (ch === '/' && regexMayStart(tokens.at(-1)?.text)) {
      const end = readRegex(content, i);
      if (!end) return { tokens: [], next: content.length, complete: false };
      tokens.push({ text: content.slice(i, end) });
      i = end;
      continue;
    }
    const word = content.slice(i).match(/^[\w$]+/);
    const operator = content
      .slice(i)
      .match(
        /^(?:===|!==|=>|&&|\|\||\?\?|==|!=|<=|>=|\?\.|\+\+|--|\*\*|\.\.\.)/,
      );
    const text = word?.[0] ?? operator?.[0] ?? ch;
    tokens.push({ text });
    i += text.length;
  }
  return { tokens: [], next: content.length, complete: false };
}

function splitTokens(tokens: CallToken[], separator: string): CallToken[][] {
  const result: CallToken[][] = [[]];
  for (const token of tokens) {
    if (token.text === separator) result.push([]);
    else result[result.length - 1].push(token);
  }
  return result;
}

function objectProperties(
  token: CallToken | undefined,
): Array<{ key: CallToken; value: CallToken[] }> {
  if (token?.text !== '{' || !token.children) return [];
  return splitTokens(token.children, ',').flatMap((property) =>
    property.length >= 3 &&
    property[1].text === ':' &&
    (property[0].string || /^[\w$]+$/.test(property[0].text))
      ? [{ key: property[0], value: property.slice(2) }]
      : [],
  );
}

function propertyName(key: CallToken): string {
  return key.string?.value ?? key.text;
}

function classExpression(
  tokens: CallToken[],
  functionNames: string[],
  objects = true,
): StringRange[] {
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token.string) return [token.string];
    if (token.text === '[' && token.children)
      return splitTokens(token.children, ',').flatMap((part) =>
        classExpression(part, functionNames, objects),
      );
    if (token.text === '{' && objects) {
      // Rewriting keys of a multi-property object can create a duplicate key
      // and discard a predicate. Unknown/spread properties can collide too.
      const properties = splitTokens(token.children ?? [], ',').filter(
        (property) => property.length > 0,
      );
      if (properties.length !== 1) return [];
      return objectProperties(token).flatMap(({ key }) =>
        key.string ? [key.string] : [],
      );
    }
    // A grouping pair does not establish class context, but preserves one.
    if (token.text === '(' && token.children)
      return classExpression(token.children, functionNames, objects);
    return [];
  }
  const question = tokens.findIndex(({ text }) => text === '?');
  if (question >= 0) {
    let nested = 0;
    for (let i = question + 1; i < tokens.length; i++) {
      if (tokens[i].text === '?') nested++;
      else if (tokens[i].text === ':' && nested-- === 0)
        return [
          ...classExpression(
            tokens.slice(question + 1, i),
            functionNames,
            objects,
          ),
          ...classExpression(tokens.slice(i + 1), functionNames, objects),
        ];
    }
    return [];
  }
  const logical = tokens.findIndex(
    ({ text }) => text === '&&' || text === '||' || text === '??',
  );
  if (logical >= 0)
    return [
      ...(tokens[logical].text === '&&'
        ? []
        : classExpression(tokens.slice(0, logical), functionNames, objects)),
      ...classExpression(tokens.slice(logical + 1), functionNames, objects),
    ];
  if (
    tokens.length === 2 &&
    functionNames.includes(tokens[0].text) &&
    tokens[1].text === '(' &&
    tokens[1].children
  )
    return classCall(tokens[0].text, tokens[1].children, functionNames);
  return [];
}

function cvaOptions(
  token: CallToken | undefined,
  functionNames: string[],
): StringRange[] {
  const result: StringRange[] = [];
  for (const { key, value } of objectProperties(token)) {
    if (value.length !== 1) continue;
    if (propertyName(key) === 'variants') {
      for (const variant of objectProperties(value[0])) {
        if (variant.value.length !== 1) continue;
        for (const choice of objectProperties(variant.value[0]))
          result.push(...classExpression(choice.value, functionNames, false));
      }
    } else if (
      propertyName(key) === 'compoundVariants' &&
      value[0].text === '[' &&
      value[0].children
    ) {
      for (const entry of splitTokens(value[0].children, ',')) {
        if (entry.length !== 1) continue;
        for (const compound of objectProperties(entry[0])) {
          if (
            propertyName(compound.key) === 'class' ||
            propertyName(compound.key) === 'className'
          )
            result.push(
              ...classExpression(compound.value, functionNames, false),
            );
        }
      }
    }
  }
  return result;
}

function classCall(
  name: string,
  tokens: CallToken[],
  functionNames: string[],
): StringRange[] {
  const args = splitTokens(tokens, ',');
  if (name === 'cva')
    return [
      ...classExpression(args[0] ?? [], functionNames, false),
      ...(args[1]?.length === 1 ? cvaOptions(args[1][0], functionNames) : []),
    ];
  return args.flatMap((arg) => classExpression(arg, functionNames));
}

function scanCallStrings(
  content: string,
  start: number,
  functionNames: string[] = [],
): {
  strings: StringRange[];
  consumed: number;
  complete: boolean;
} {
  const scanned = readCallTokens(content, start);
  const name = previousToken(content, start - 1) ?? '';
  return {
    strings: scanned.complete
      ? classCall(name, scanned.tokens, functionNames)
      : [],
    consumed: scanned.next - start,
    complete: scanned.complete,
  };
}

function offsetSuppressor(
  content: string,
  isSuppressed?: (line: number) => boolean,
): ((offset: number) => boolean) | undefined {
  if (!isSuppressed) return undefined;
  const positionAt = createPositionLookup(content);
  return (offset) => isSuppressed(positionAt(offset).line);
}

// Ignore source comments, quoted prose and regex literals before looking for
// attribute/function entry points. Ambiguous syntax is deliberately skipped.
function protectedSourceOffsets(content: string): (offset: number) => boolean {
  const ranges: Array<{ start: number; end: number }> = [];
  const tags: string[] = [];
  const pendingTags: Array<{
    end: number;
    name: string;
    closing: boolean;
    selfClosing: boolean;
  }> = [];
  let expressionEnd = 0;
  const controlParens: boolean[] = [];
  let lastControlParenEnd = -1;
  let i = 0;
  while (i < content.length) {
    const start = i;
    const ch = content[i];
    const tag = pendingTags.at(0);
    if (tag?.end === i) {
      if (tag.closing) tags.pop();
      else if (!tag.selfClosing) tags.push(tag.name);
      pendingTags.length = 0;
      i++;
      continue;
    }
    if (!tag && ch === '<' && !content.startsWith('<!--', i)) {
      const match: RegExpMatchArray | null = content
        .slice(i)
        .match(/^<(\/?)(?:([A-Za-z][\w:.-]*)(?=[\s/>])|(?=>))/);
      if (match) {
        let end: number = i + match[0].length;
        while (end < content.length && content[end] !== '>') {
          if (
            content[end] === '"' ||
            content[end] === "'" ||
            content[end] === '`'
          ) {
            end = readQuotedString(content, end)?.next ?? content.length;
          } else if (content[end] === '{') {
            const expression = readCallTokens(content, end + 1, '}');
            end = expression.next;
          } else end++;
        }
        const closing: boolean = match[1] === '/';
        const selfClosing =
          content[end - 1] === '/' ||
          /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(
            match[2] ?? '',
          );
        const name: string = match[2] ?? '';
        if (
          end < content.length &&
          (tags.length > 0 ||
            selfClosing ||
            content.includes(`</${name}>`, end))
        )
          pendingTags.push({ end, name, closing, selfClosing });
      }
    }
    const rawTag = tags.at(-1)?.toLowerCase();
    if (!tag && rawTag === 'style' && !content.startsWith('</style', i)) {
      const end = content.indexOf('</style', i);
      i = end < 0 ? content.length : end;
      ranges.push({ start, end: i });
      continue;
    }
    if (
      !tag &&
      tags.length > 0 &&
      rawTag !== 'script' &&
      i >= expressionEnd &&
      ch !== '<'
    ) {
      if (ch === '{') expressionEnd = readCallTokens(content, i + 1, '}').next;
      else {
        while (i < content.length && content[i] !== '<' && content[i] !== '{')
          i++;
        ranges.push({ start, end: i });
        continue;
      }
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      i = readQuotedString(content, i)?.next ?? content.length;
    } else if (content.startsWith('//', i)) {
      const end = content.indexOf('\n', i + 2);
      i = end < 0 ? content.length : end;
    } else if (content.startsWith('/*', i) || content.startsWith('<!--', i)) {
      const html = content.startsWith('<!--', i);
      const ending = html ? '-->' : '*/';
      const end = content.indexOf(ending, i + (html ? 4 : 2));
      i = end < 0 ? content.length : end + ending.length;
    } else if (ch === '/' && content[i - 1] !== '<' && content[i + 1] !== '>') {
      const preceding = previousToken(content, i);
      let before = i - 1;
      while (before >= 0 && /\s/.test(content[before])) before--;
      const afterControlCondition =
        preceding === ')' && before === lastControlParenEnd;
      const end =
        regexMayStart(preceding) || afterControlCondition
          ? readRegex(content, i)
          : null;
      if (!end) {
        i++;
        continue;
      }
      i = end;
    } else {
      if (ch === '(') {
        controlParens.push(
          ['if', 'while', 'for', 'with', 'switch', 'catch'].includes(
            previousToken(content, i) ?? '',
          ),
        );
      } else if (ch === ')' && controlParens.pop()) lastControlParenEnd = i;
      i++;
      continue;
    }
    ranges.push({ start, end: i });
  }
  return (offset) => {
    let low = 0;
    let high = ranges.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (ranges[mid].end <= offset) low = mid + 1;
      else high = mid;
    }
    return low < ranges.length && ranges[low].start <= offset;
  };
}

/** Collect disjoint ranges against the original source before any rewrite.
 * Source offsets and suppression line numbers must not depend on an earlier
 * attribute transform changing the number of lines in the file.
 */
function collectClassStrings(
  content: string,
  opts: ClassStringOpts,
): StringRange[] {
  const attrNames = opts.attributeNames?.length
    ? opts.attributeNames
    : DEFAULT_ATTR_NAMES;
  const isProtected = protectedSourceOffsets(content);
  const strings: StringRange[] = attributeStrings(
    content,
    attrNames,
    opts.functionNames,
  ).filter((string) => !isProtected(string.attributeStart));
  const funcNames = opts.functionNames;
  if (funcNames?.length) {
    const funcRe = new RegExp(
      `\\b(?:${funcNames.map(escapeRegex).join('|')})\\s*\\(`,
      'g',
    );
    let consumedUntil = 0;
    for (const match of content.matchAll(funcRe)) {
      const offset = match.index ?? 0;
      // A configured identifier must not select a suffix of a member call or
      // a larger JavaScript identifier (where `$` is also an identifier char).
      if (
        previousToken(content, offset) === '.' ||
        /[\w$]/.test(content[offset - 1] ?? '')
      )
        continue;
      if (isProtected(offset) || offset < consumedUntil) continue;
      const start = (match.index ?? 0) + match[0].length;
      const scanned = scanCallStrings(content, start, funcNames);
      strings.push(...scanned.strings);
      consumedUntil = start + scanned.consumed;
    }
  }
  const seen = new Set<string>();
  return strings
    .filter((string) => {
      const key = `${string.start}:${string.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.start - right.start);
}

export function replaceClassStrings(
  content: string,
  transform: (s: string) => string,
  opts: ClassStringOpts = {},
): { result: string; count: number } {
  const isSuppressedAt = offsetSuppressor(content, opts.isSuppressed);
  const parts: string[] = [];
  let cursor = 0;
  let count = 0;
  for (const string of collectClassStrings(content, opts)) {
    const out = transformStaticClasses(
      string.value,
      transform,
      isSuppressedAt,
      string.start,
      string.braceExpressions,
    );
    if (out !== string.value) count++;
    parts.push(content.slice(cursor, string.start), out);
    cursor = string.end;
  }
  parts.push(content.slice(cursor));
  return { result: parts.join(''), count };
}

export function extractClassStrings(
  content: string,
  opts: ClassStringOpts = {},
): Array<{ value: string; start: number; end: number }> {
  return staticRanges(collectClassStrings(content, opts));
}

function staticRanges(strings: StringRange[]): StringRange[] {
  const seen = new Set<string>();
  return strings.flatMap((string) =>
    staticClassRanges(string.value, string.braceExpressions).flatMap(
      (range) => {
        const start = string.start + range.start;
        const end = string.start + range.end;
        const key = `${start}:${end}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ value: range.value, start, end }];
      },
    ),
  );
}
