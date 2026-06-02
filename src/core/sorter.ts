import { readFileSync, writeFileSync } from 'node:fs';
import { type ClassStringOpts, replaceClassStrings } from './class-strings.js';

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
    ['grayscale', 'invert', 'sepia'].includes(base) ||
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
  const prefix = cls.slice(0, cls.lastIndexOf(':'));
  if (RE_BREAKPOINTS.test(prefix)) return 1;
  if (/^(dark|print)$/.test(prefix)) return 2;
  return 3;
}

export function sortClasses(
  classStr: string,
  sortOrder?: SortCategory[],
): string {
  const classes = classStr.split(/\s+/).filter(Boolean);
  if (classes.length <= 1) return classStr;

  const rank = buildRank(sortOrder?.length ? sortOrder : DEFAULT_SORT_ORDER);

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
    .map((x) => x.cls)
    .join(' ');
}

export function sortFile(
  filePath: string,
  opts: ClassStringOpts = {},
  sortOrder?: SortCategory[],
): number {
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = replaceClassStrings(
    content,
    (s) => sortClasses(s, sortOrder),
    opts,
  );
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
