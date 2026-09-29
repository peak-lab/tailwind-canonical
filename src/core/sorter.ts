import { type ClassStringOpts, replaceClassStrings } from './class-strings.js';
import { makeLineSuppressor } from './suppressions.js';

const DISPLAY_CLASSES = new Set([
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'table',
  'inline-table',
  'flow-root',
  'contents',
  'list-item',
  'hidden',
  'container',
]);

const POSITION_CLASSES = new Set([
  'static',
  'fixed',
  'absolute',
  'relative',
  'sticky',
]);

const TYPOGRAPHY_KEYWORDS = new Set([
  'truncate',
  'uppercase',
  'lowercase',
  'capitalize',
  'normal-case',
  'underline',
  'line-through',
  'no-underline',
  'italic',
  'not-italic',
  'antialiased',
  'subpixel-antialiased',
]);

const RE_DARK_PRINT = /^(dark|print)$/;

const TEXT_SIZES =
  /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|left|center|right|justify|start|end)$/;

const RE_LAYOUT =
  /^(overflow|overscroll|object|float|clear|isolation|box|columns)[-]/;
const RE_INSET = /^(inset|top|right|bottom|left|z)[-]/;
const RE_FLEX_GRID =
  /^(flex|grid|col|row|auto-cols|auto-rows|justify|items|content|self|place|grow|shrink|order|gap|space)[-]/;
const RE_SIZING = /^(aspect|size|w|h|min-w|max-w|min-h|max-h)[-]/;
const RE_BORDER = /^(rounded|border|ring|outline|divide)[-]/;
const RE_SPACING = /^(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me)[-]/;
const RE_TYPOGRAPHY =
  /^(font|leading|tracking|line-clamp|decoration|list|whitespace)[-]/;
const RE_COLORS = /^(text|bg|from|to|via|fill|stroke|caret|accent)[-]/;
const RE_EFFECTS =
  /^(opacity|shadow|blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|backdrop|mix-blend|bg-blend)[-]/;
const RE_TRANSITIONS =
  /^(transition|duration|ease|delay|animate|will-change)[-]/;
const RE_TRANSFORMS = /^(scale|rotate|translate|skew|origin)[-]/;
const RE_INTERACTIVITY =
  /^(cursor|pointer-events|select|appearance|resize|scroll|snap|touch)[-]/;
const RE_BREAKPOINTS = /^(sm|md|lg|xl|2xl)$/;

export type SortCategory =
  | 'layout'
  | 'position'
  | 'inset'
  | 'display'
  | 'flex-grid'
  | 'sizing'
  | 'border'
  | 'spacing'
  | 'typography'
  | 'colors'
  | 'effects'
  | 'transitions'
  | 'transforms'
  | 'interactivity'
  | 'accessibility';

export const DEFAULT_SORT_ORDER: SortCategory[] = [
  'layout',
  'position',
  'inset',
  'display',
  'flex-grid',
  'sizing',
  'border',
  'spacing',
  'typography',
  'colors',
  'effects',
  'transitions',
  'transforms',
  'interactivity',
  'accessibility',
];

function getCategory(cls: string): SortCategory | null {
  const base = cls.includes(':') ? cls.slice(cls.lastIndexOf(':') + 1) : cls;

  if (base === 'container' || RE_LAYOUT.test(base)) return 'layout';

  if (POSITION_CLASSES.has(base)) return 'position';
  if (RE_INSET.test(base)) return 'inset';

  if (DISPLAY_CLASSES.has(base)) return 'display';

  if (base === 'grow' || base === 'shrink' || RE_FLEX_GRID.test(base))
    return 'flex-grid';

  if (RE_SIZING.test(base)) return 'sizing';

  if (
    base === 'rounded' ||
    base === 'border' ||
    base === 'ring' ||
    base === 'outline' ||
    RE_BORDER.test(base)
  )
    return 'border';

  if (RE_SPACING.test(base)) return 'spacing';

  if (
    TEXT_SIZES.test(base) ||
    RE_TYPOGRAPHY.test(base) ||
    TYPOGRAPHY_KEYWORDS.has(base)
  )
    return 'typography';

  if (RE_COLORS.test(base)) return 'colors';

  if (
    base === 'shadow' ||
    base === 'blur' ||
    base === 'grayscale' ||
    base === 'invert' ||
    base === 'sepia' ||
    RE_EFFECTS.test(base)
  )
    return 'effects';

  if (base === 'transition' || RE_TRANSITIONS.test(base)) return 'transitions';

  if (RE_TRANSFORMS.test(base)) return 'transforms';

  if (RE_INTERACTIVITY.test(base)) return 'interactivity';

  if (base === 'sr-only' || base === 'not-sr-only') return 'accessibility';

  return null;
}

function buildRank(
  order: SortCategory[],
): (category: SortCategory | null) => number {
  const ranks = new Map<string, number>();
  order.forEach((name, i) => {
    if (!ranks.has(name)) ranks.set(name, i);
  });
  const end = order.length;
  return (category) =>
    category !== null && ranks.has(category)
      ? (ranks.get(category) as number)
      : end;
}

function getVariantOrder(cls: string): number {
  if (!cls.includes(':')) return 0;
  const segments = cls.slice(0, cls.lastIndexOf(':')).split(':');
  if (segments.some((s) => RE_BREAKPOINTS.test(s))) return 1;
  if (segments.some((s) => RE_DARK_PRINT.test(s))) return 2;
  return 3;
}

const RE_ARBITRARY = /\[[^\]]*\]/g;
const RE_IMPLAUSIBLE_CLASS = /^:|:$|["'`{}?]|^[&|]+$/;

function isPlausibleClass(token: string): boolean {
  return !RE_IMPLAUSIBLE_CLASS.test(token.replace(RE_ARBITRARY, '[]'));
}

type Atom = { text: string; start: number; end: number; fixed: boolean };

function interpolationEnd(str: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = from + 1; j < str.length; j++) {
    const ch = str[j];
    if (quote) {
      if (ch === '\\') j++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return j + 1;
  }
  return str.length;
}

function splitAtoms(str: string): Atom[] {
  const atoms: Atom[] = [];
  let i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) {
      i++;
      continue;
    }
    let j = i;
    let interpolated = false;
    while (j < str.length && !/\s/.test(str[j])) {
      if (str.startsWith('${', j)) {
        interpolated = true;
        j = interpolationEnd(str, j);
      } else j++;
    }
    const text = str.slice(i, j);
    atoms.push({
      text,
      start: i,
      end: j,
      fixed: interpolated || !isPlausibleClass(text),
    });
    i = j;
  }
  return atoms;
}

function sortSegment(
  classes: string[],
  rank: (category: SortCategory | null) => number,
): string[] {
  return classes
    .map((cls, i) => ({
      cls,
      cat: rank(getCategory(cls)),
      variant: getVariantOrder(cls),
      i,
    }))
    .sort((a, b) => {
      const vd = a.variant - b.variant;
      if (vd !== 0) return vd;
      const cd = a.cat - b.cat;
      if (cd !== 0) return cd;
      return a.i - b.i;
    })
    .map((x) => x.cls);
}

export function sortClasses(
  classStr: string,
  sortOrder?: SortCategory[],
): string {
  const atoms = splitAtoms(classStr);
  if (atoms.length <= 1) return classStr;

  const rank = buildRank(sortOrder?.length ? sortOrder : DEFAULT_SORT_ORDER);

  if (!atoms.some((a) => a.fixed))
    return sortSegment(
      atoms.map((a) => a.text),
      rank,
    ).join(' ');

  const texts = atoms.map((a) => a.text);
  let start = 0;
  for (let k = 0; k <= atoms.length; k++) {
    if (k < atoms.length && !atoms[k].fixed) continue;
    const sorted = sortSegment(texts.slice(start, k), rank);
    texts.splice(start, sorted.length, ...sorted);
    start = k + 1;
  }

  let out = '';
  let cursor = 0;
  atoms.forEach((atom, k) => {
    out += classStr.slice(cursor, atom.start) + texts[k];
    cursor = atom.end;
  });
  return out + classStr.slice(cursor);
}

export function sortContent(
  content: string,
  opts: ClassStringOpts = {},
  sortOrder?: SortCategory[],
): { result: string; count: number } {
  return replaceClassStrings(content, (s) => sortClasses(s, sortOrder), {
    ...opts,
    isSuppressed: makeLineSuppressor(content),
  });
}

export { sortFile } from '../io/sorter.js';
