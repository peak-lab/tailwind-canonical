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

function attributeValueStrings(
  content: string,
  start: number,
  name: string,
  functionNames: string[],
): StringRange[] {
  if (content[start] === '{') {
    const expression = readCallTokens(content, start + 1, '}');
    return expression.complete
      ? classExpression(expression.tokens, functionNames)
      : [];
  }
  if (!['"', "'", '`'].includes(content[start])) return [];
  const quoted = readQuotedString(content, start);
  if (!quoted) return [];
  if (!(name.startsWith(':') || name.startsWith('v-bind:')))
    return [{ ...quoted, braceExpressions: true }];

  // Vue bindings contain JavaScript, not a class list. Entities require an
  // HTML decoder/source map, so leave those expressions intact for now.
  if (/&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(quoted.value)) return [];
  const expression = readCallTokens(content, quoted.start, content[start]);
  return expression.complete && expression.next === quoted.next
    ? classExpression(expression.tokens, functionNames)
    : [];
}

function attributeStrings(
  content: string,
  names: string[],
  functionNames: string[] = [],
): Array<StringRange & { attributeStart: number }> {
  const result: Array<StringRange & { attributeStart: number }> = [];
  for (const match of content.matchAll(buildAttrRegex(names))) {
    const attributeStart = (match.index ?? 0) + match[1].length;
    const start = (match.index ?? 0) + match[0].length;
    result.push(
      ...attributeValueStrings(content, start, match[2], functionNames).map(
        (string) => ({ ...string, attributeStart }),
      ),
    );
  }
  return result;
}

function interpolationLiteralEnd(
  content: string,
  offset: number,
): number | null {
  const ch = content[offset];
  if (ch === '"' || ch === "'" || ch === '`')
    return readQuotedString(content, offset)?.next ?? content.length;
  if (ch !== '/') return null;
  const commentEnd = sourceCommentEnd(content, offset);
  if (commentEnd !== null) return commentEnd;
  return regexMayStart(previousToken(content, offset))
    ? (readRegex(content, offset) ?? content.length)
    : null;
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
    const literalEnd = interpolationLiteralEnd(content, i);
    if (literalEnd !== null) {
      i = literalEnd;
      continue;
    }
    if (content[i] === '{') depth++;
    else if (content[i] === '}' && --depth === 0) return i + 1;
    i++;
  }
  return content.length;
}

function staticClassDelimiter(
  value: string,
  offset: number,
  bracketDepth: number,
  braceExpressions: boolean,
): { openingLength: number; bracketDepth: number } {
  let escapes = 0;
  for (let j = offset - 1; j >= 0 && value[j] === '\\'; j--) escapes++;
  if (escapes % 2 === 1) return { openingLength: 0, bracketDepth };
  if (value.startsWith('${', offset)) return { openingLength: 2, bracketDepth };
  if (braceExpressions && bracketDepth === 0 && value[offset] === '{')
    return { openingLength: 1, bracketDepth };
  if (value[offset] === '[')
    return { openingLength: 0, bracketDepth: bracketDepth + 1 };
  if (value[offset] === ']')
    return { openingLength: 0, bracketDepth: Math.max(0, bracketDepth - 1) };
  return { openingLength: 0, bracketDepth };
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
    const delimiter = staticClassDelimiter(
      value,
      i,
      bracketDepth,
      braceExpressions,
    );
    bracketDepth = delimiter.bracketDepth;
    if (!delimiter.openingLength) {
      i++;
      continue;
    }
    let before = i;
    while (before > start && !/\s/.test(value[before - 1])) before--;
    if (before > start)
      ranges.push({ value: value.slice(start, before), start, end: before });
    i = interpolationEnd(value, i, delimiter.openingLength);
    while (i < value.length && !/\s/.test(value[i])) i++;
    start = i;
  }
  if (start < value.length)
    ranges.push({ value: value.slice(start), start, end: value.length });
  return ranges;
}

function suppressedLineRanges(
  value: string,
  isSuppressedAt: ((offset: number) => boolean) | undefined,
  offset: number,
): Array<{ start: number; end: number }> {
  const suppressed: Array<{ start: number; end: number }> = [];
  if (!isSuppressedAt) return suppressed;
  let lineStart = 0;
  while (lineStart < value.length) {
    const newline = value.indexOf('\n', lineStart);
    const end = newline < 0 ? value.length : newline + 1;
    if (isSuppressedAt(offset + lineStart))
      suppressed.push({ start: lineStart, end });
    lineStart = end;
  }
  return suppressed;
}

function transformStaticClasses(
  value: string,
  transform: (s: string) => string,
  isSuppressedAt?: (offset: number) => boolean,
  offset = 0,
  braceExpressions = false,
): string {
  const suppressed = suppressedLineRanges(value, isSuppressedAt, offset);
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
    const trailing = preserveEdges
      ? segment.slice(segment.trimEnd().length)
      : '';
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

type CallTrivia = { next: number; complete: boolean };
type ReadCallToken =
  | { token: CallToken; next: number; complete: true }
  | { next: number; complete: false };

function skipCallTrivia(content: string, start: number): CallTrivia {
  let i = start;
  while (i < content.length) {
    if (/\s/.test(content[i])) {
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
      if (end < 0) return { next: content.length, complete: false };
      i = end + 2;
      continue;
    }
    break;
  }
  return { next: i, complete: true };
}

function readCallToken(
  content: string,
  start: number,
  previous: string | undefined,
): ReadCallToken {
  const ch = content[start];
  if (ch === '"' || ch === "'" || ch === '`') {
    const quoted = readQuotedString(content, start);
    if (!quoted) return { next: content.length, complete: false };
    return {
      token: { text: content.slice(start, quoted.next), string: quoted },
      next: quoted.next,
      complete: true,
    };
  }
  if (ch === '(' || ch === '[' || ch === '{') {
    const closing = { '(': ')', '[': ']', '{': '}' }[ch];
    const group = readCallTokens(content, start + 1, closing);
    if (!group.complete) return { next: group.next, complete: false };
    return {
      token: { text: ch, children: group.tokens },
      next: group.next,
      complete: true,
    };
  }
  if (ch === '/' && regexMayStart(previous)) {
    const end = readRegex(content, start);
    if (!end) return { next: content.length, complete: false };
    return {
      token: { text: content.slice(start, end) },
      next: end,
      complete: true,
    };
  }
  const word = /^[\w$]+/.exec(content.slice(start));
  const operator =
    /^(?:===|!==|=>|&&|\|\||\?\?|==|!=|<=|>=|\?\.|\+\+|--|\*\*|\.\.\.)/.exec(
      content.slice(start),
    );
  const text = word?.[0] ?? operator?.[0] ?? ch;
  return { token: { text }, next: start + text.length, complete: true };
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
    const trivia = skipCallTrivia(content, i);
    if (!trivia.complete)
      return { tokens: [], next: trivia.next, complete: false };
    i = trivia.next;
    if (i === content.length) break;
    const ch = content[i];
    if (ch === closing) return { tokens, next: i + 1, complete: true };
    if (ch === ')' || ch === ']' || ch === '}')
      return { tokens: [], next: i + 1, complete: false };
    const read = readCallToken(content, i, tokens.at(-1)?.text);
    if (!read.complete) return { tokens: [], next: read.next, complete: false };
    tokens.push(read.token);
    i = read.next;
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

function singleTokenClasses(
  token: CallToken,
  functionNames: string[],
  objects: boolean,
): StringRange[] {
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

function conditionalColon(tokens: CallToken[], question: number): number {
  let nested = 0;
  for (let i = question + 1; i < tokens.length; i++) {
    if (tokens[i].text === '?') nested++;
    else if (tokens[i].text === ':' && nested-- === 0) return i;
  }
  return -1;
}

function conditionalClasses(
  tokens: CallToken[],
  question: number,
  functionNames: string[],
  objects: boolean,
): StringRange[] {
  const colon = conditionalColon(tokens, question);
  if (colon < 0) return [];
  return [
    ...classExpression(
      tokens.slice(question + 1, colon),
      functionNames,
      objects,
    ),
    ...classExpression(tokens.slice(colon + 1), functionNames, objects),
  ];
}

function classExpression(
  tokens: CallToken[],
  functionNames: string[],
  objects = true,
): StringRange[] {
  if (tokens.length === 1)
    return singleTokenClasses(tokens[0], functionNames, objects);
  const question = tokens.findIndex(({ text }) => text === '?');
  if (question >= 0)
    return conditionalClasses(tokens, question, functionNames, objects);
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

function cvaVariantClasses(
  token: CallToken,
  functionNames: string[],
): StringRange[] {
  const result: StringRange[] = [];
  for (const variant of objectProperties(token)) {
    if (variant.value.length !== 1) continue;
    for (const choice of objectProperties(variant.value[0]))
      result.push(...classExpression(choice.value, functionNames, false));
  }
  return result;
}

function cvaCompoundClasses(
  token: CallToken,
  functionNames: string[],
): StringRange[] {
  if (token.text !== '[' || !token.children) return [];
  const result: StringRange[] = [];
  for (const entry of splitTokens(token.children, ',')) {
    if (entry.length !== 1) continue;
    for (const compound of objectProperties(entry[0])) {
      if (
        propertyName(compound.key) === 'class' ||
        propertyName(compound.key) === 'className'
      )
        result.push(...classExpression(compound.value, functionNames, false));
    }
  }
  return result;
}

function cvaOptions(
  token: CallToken | undefined,
  functionNames: string[],
): StringRange[] {
  const result: StringRange[] = [];
  for (const { key, value } of objectProperties(token)) {
    if (value.length !== 1) continue;
    if (propertyName(key) === 'variants') {
      result.push(...cvaVariantClasses(value[0], functionNames));
    } else if (propertyName(key) === 'compoundVariants') {
      result.push(...cvaCompoundClasses(value[0], functionNames));
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

type SourceTag = {
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
};

type MarkupContext = {
  tags: string[];
  pendingTag: SourceTag | undefined;
  expressionEnd: number;
};

type SourceAdvance = { next: number; protected: boolean };

function sourceTagEnd(content: string, start: number): number {
  let end = start;
  while (end < content.length && content[end] !== '>') {
    if (content[end] === '"' || content[end] === "'" || content[end] === '`') {
      end = readQuotedString(content, end)?.next ?? content.length;
    } else if (content[end] === '{') {
      end = readCallTokens(content, end + 1, '}').next;
    } else end++;
  }
  return end;
}

function sourceTagAt(
  content: string,
  offset: number,
  hasOpenTag: boolean,
): SourceTag | undefined {
  const match = content
    .slice(offset)
    .match(/^<(\/?)(?:([A-Za-z][\w:.-]*)(?=[\s/>])|(?=>))/);
  if (!match) return undefined;
  const end = sourceTagEnd(content, offset + match[0].length);
  const name = match[2] ?? '';
  const selfClosing =
    content[end - 1] === '/' ||
    /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(
      name,
    );
  if (
    end >= content.length ||
    !(hasOpenTag || selfClosing || content.includes(`</${name}>`, end))
  )
    return undefined;
  return { end, name, closing: match[1] === '/', selfClosing };
}

function markupTextAdvance(
  content: string,
  offset: number,
  context: MarkupContext,
): SourceAdvance | undefined {
  const rawTag = context.tags.at(-1)?.toLowerCase();
  if (rawTag === 'style' && !content.startsWith('</style', offset)) {
    const end = content.indexOf('</style', offset);
    return { next: end < 0 ? content.length : end, protected: true };
  }
  if (
    context.tags.length === 0 ||
    rawTag === 'script' ||
    offset < context.expressionEnd ||
    content[offset] === '<'
  )
    return undefined;
  if (content[offset] === '{') {
    context.expressionEnd = readCallTokens(content, offset + 1, '}').next;
    return undefined;
  }
  let end = offset;
  while (end < content.length && content[end] !== '<' && content[end] !== '{')
    end++;
  return { next: end, protected: true };
}

function markupAdvance(
  content: string,
  offset: number,
  context: MarkupContext,
): SourceAdvance | undefined {
  const tag = context.pendingTag;
  if (tag?.end === offset) {
    if (tag.closing) context.tags.pop();
    else if (!tag.selfClosing) context.tags.push(tag.name);
    context.pendingTag = undefined;
    return { next: offset + 1, protected: false };
  }
  if (!tag && content[offset] === '<' && !content.startsWith('<!--', offset)) {
    context.pendingTag = sourceTagAt(content, offset, context.tags.length > 0);
  }
  // A newly discovered tag becomes pending on the next scan iteration. The
  // current character still belongs to the surrounding markup context.
  return tag ? undefined : markupTextAdvance(content, offset, context);
}

function sourceCommentEnd(content: string, offset: number): number | null {
  if (content.startsWith('//', offset)) {
    const end = content.indexOf('\n', offset + 2);
    return end < 0 ? content.length : end;
  }
  const html = content.startsWith('<!--', offset);
  if (!(html || content.startsWith('/*', offset))) return null;
  const ending = html ? '-->' : '*/';
  const end = content.indexOf(ending, offset + (html ? 4 : 2));
  return end < 0 ? content.length : end + ending.length;
}

function protectedLiteralEnd(
  content: string,
  offset: number,
  lastControlParenEnd: number,
): number | null {
  const ch = content[offset];
  if (ch === '"' || ch === "'" || ch === '`')
    return readQuotedString(content, offset)?.next ?? content.length;
  const commentEnd = sourceCommentEnd(content, offset);
  if (commentEnd !== null) return commentEnd;
  if (ch !== '/' || content[offset - 1] === '<' || content[offset + 1] === '>')
    return null;
  const preceding = previousToken(content, offset);
  let before = offset - 1;
  while (before >= 0 && /\s/.test(content[before])) before--;
  const afterControlCondition =
    preceding === ')' && before === lastControlParenEnd;
  return regexMayStart(preceding) || afterControlCondition
    ? readRegex(content, offset)
    : null;
}

// Ignore source comments, quoted prose and regex literals before looking for
// attribute/function entry points. Ambiguous syntax is deliberately skipped.
function protectedSourceOffsets(content: string): (offset: number) => boolean {
  const ranges: Array<{ start: number; end: number }> = [];
  const markup: MarkupContext = {
    tags: [],
    pendingTag: undefined,
    expressionEnd: 0,
  };
  const controlParens: boolean[] = [];
  let lastControlParenEnd = -1;
  let i = 0;
  while (i < content.length) {
    const start = i;
    const advance = markupAdvance(content, i, markup);
    if (advance) {
      if (advance.protected) ranges.push({ start, end: advance.next });
      i = advance.next;
      continue;
    }
    const end = protectedLiteralEnd(content, i, lastControlParenEnd);
    if (end !== null) {
      ranges.push({ start, end });
      i = end;
      continue;
    }
    if (content[i] === '(') {
      controlParens.push(
        ['if', 'while', 'for', 'with', 'switch', 'catch'].includes(
          previousToken(content, i) ?? '',
        ),
      );
    } else if (content[i] === ')' && controlParens.pop())
      lastControlParenEnd = i;
    i++;
  }
  return (offset) => sourceRangeContains(ranges, offset);
}

function sourceRangeContains(
  ranges: Array<{ start: number; end: number }>,
  offset: number,
): boolean {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ranges[mid].end <= offset) low = mid + 1;
    else high = mid;
  }
  return low < ranges.length && ranges[low].start <= offset;
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
