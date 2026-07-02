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

function isLeadingClass(base: string): boolean {
  return /^!?leading-/.test(base);
}

function isArbitraryTextSize(base: string): boolean {
  return /^!?text-\[-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch|ex|lh|rlh|vw|vh|vmin|vmax|vi|vb|svw|lvw|dvw|svh|lvh|dvh)\]$/.test(
    base,
  );
}

function customTextClassSet(
  customTextTokens?: Record<number, string>,
): Set<string> {
  return new Set(
    Object.values(customTextTokens ?? {}).map((token) => `text-${token}`),
  );
}

function isUnsafeTextSize(
  base: string,
  customTextClasses: Set<string>,
): boolean {
  const normalized = base.startsWith('!') ? base.slice(1) : base;
  return customTextClasses.has(normalized) || isArbitraryTextSize(normalized);
}

function restoreLeadingForUnsafeTextSizes(
  original: string,
  merged: string,
  opts: ClassStringOpts,
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
  const customTextClasses = customTextClassSet(opts.customTextTokens);
  const restored: string[] = [];

  for (const cls of mergedClasses) {
    const leading = originalClasses
      .slice(
        0,
        originalClasses.findIndex(({ token }) => token === cls.token),
      )
      .filter(
        (candidate) =>
          isLeadingClass(candidate.base) &&
          candidate.modifiers === cls.modifiers &&
          !mergedTokens.has(candidate.token),
      )
      .at(-1);

    if (
      leading &&
      isUnsafeTextSize(cls.base, customTextClasses) &&
      !mergedClasses.some(
        (candidate) =>
          isLeadingClass(candidate.base) &&
          candidate.modifiers === cls.modifiers,
      )
    ) {
      restored.push(leading.token);
      mergedTokens.add(leading.token);
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
  return replaceClassStrings(
    content,
    (classes) => {
      const merged = twMerge(classes);
      return restoreLeadingForUnsafeTextSizes(classes, merged, opts);
    },
    {
      ...opts,
      isSuppressed: makeLineSuppressor(content),
    },
  );
}

export { mergeFile } from '../io/merger.js';
