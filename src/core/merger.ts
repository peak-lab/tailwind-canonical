import { type ClassStringOpts, replaceClassStrings } from './class-strings.js';
import { makeLineSuppressor } from './suppressions.js';

type ParsedClass = {
  token: string;
  modifiers: string;
  base: string;
};

function splitOutsideBrackets(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
}

function parseClassToken(token: string): ParsedClass {
  const parts = splitOutsideBrackets(token, ':');
  return {
    token,
    modifiers: parts.slice(0, -1).join(':'),
    base: parts.at(-1) ?? token,
  };
}

const RE_LEADING = /^!?leading-/;

const RE_ARBITRARY_TEXT_SIZE =
  /^!?text-\[-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch|ex|lh|rlh|vw|vh|vmin|vmax|vi|vb|svw|lvw|dvw|svh|lvh|dvh)\]$/;

function isUnsafeTextSize(
  base: string,
  customTextClasses: Set<string>,
): boolean {
  const normalized = base.startsWith('!') ? base.slice(1) : base;
  return (
    customTextClasses.has(normalized) || RE_ARBITRARY_TEXT_SIZE.test(normalized)
  );
}

/**
 * Last `leading-*` class declared before `cls` in the original string that
 * twMerge dropped, matching `cls`'s variant modifiers. Scans backwards from
 * `cls`'s own position — a leading declared after it never applied to it.
 */
function lastLeadingBefore(
  originalClasses: ParsedClass[],
  cls: ParsedClass,
  mergedTokens: Set<string>,
): ParsedClass | undefined {
  const at = originalClasses.findIndex(({ token }) => token === cls.token);
  const from = (at === -1 ? originalClasses.length : at) - 1;
  for (let i = from; i >= 0; i -= 1) {
    const candidate = originalClasses[i];
    if (
      RE_LEADING.test(candidate.base) &&
      candidate.modifiers === cls.modifiers &&
      !mergedTokens.has(candidate.token)
    ) {
      return candidate;
    }
  }
  return undefined;
}

function restoreLeadingForUnsafeTextSizes(
  original: string,
  merged: string,
  customTextClasses: Set<string>,
): string {
  const originalClasses = original
    .split(/\s+/)
    .filter(Boolean)
    .map(parseClassToken);
  const mergedClasses = merged
    .split(/\s+/)
    .filter(Boolean)
    .map(parseClassToken);
  const mergedTokens = new Set(mergedClasses.map(({ token }) => token));
  const keptLeadingModifiers = new Set(
    mergedClasses
      .filter(({ base }) => RE_LEADING.test(base))
      .map(({ modifiers }) => modifiers),
  );
  const restored: string[] = [];

  for (const cls of mergedClasses) {
    if (
      isUnsafeTextSize(cls.base, customTextClasses) &&
      !keptLeadingModifiers.has(cls.modifiers)
    ) {
      const leading = lastLeadingBefore(originalClasses, cls, mergedTokens);
      if (leading) {
        restored.push(leading.token);
        mergedTokens.add(leading.token);
      }
    }

    restored.push(cls.token);
  }

  return restored.join(' ');
}

export function mergeContent(
  content: string,
  twMerge: (classes: string) => string,
  opts: ClassStringOpts = {},
): { result: string; count: number } {
  const customTextClasses = new Set(
    Object.values(opts.customTextTokens ?? {}).map((token) => `text-${token}`),
  );
  return replaceClassStrings(
    content,
    (classes) =>
      restoreLeadingForUnsafeTextSizes(
        classes,
        twMerge(classes),
        customTextClasses,
      ),
    {
      ...opts,
      isSuppressed: makeLineSuppressor(content),
    },
  );
}

export { mergeFile } from '../io/merger.js';
