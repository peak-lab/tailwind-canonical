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

function getCategory(cls: string): number {
  const base = cls.includes(':') ? cls.slice(cls.lastIndexOf(':') + 1) : cls;

  if (base === 'container' || RE_LAYOUT.test(base)) return 0;

  if (POSITION_CLASSES.has(base)) return 10;
  if (RE_INSET.test(base)) return 15;

  if (DISPLAY_CLASSES.has(base)) return 20;

  if (base === 'grow' || base === 'shrink' || RE_FLEX_GRID.test(base))
    return 25;

  if (RE_SIZING.test(base)) return 30;

  if (
    base === 'rounded' ||
    base === 'border' ||
    base === 'ring' ||
    base === 'outline' ||
    RE_BORDER.test(base)
  )
    return 40;

  if (RE_SPACING.test(base)) return 50;

  if (
    TEXT_SIZES.test(base) ||
    RE_TYPOGRAPHY.test(base) ||
    TYPOGRAPHY_KEYWORDS.has(base)
  )
    return 60;

  if (RE_COLORS.test(base)) return 70;

  if (
    base === 'shadow' ||
    base === 'blur' ||
    ['grayscale', 'invert', 'sepia'].includes(base) ||
    RE_EFFECTS.test(base)
  )
    return 80;

  if (base === 'transition' || RE_TRANSITIONS.test(base)) return 90;

  if (RE_TRANSFORMS.test(base)) return 100;

  if (RE_INTERACTIVITY.test(base)) return 110;

  if (base === 'sr-only' || base === 'not-sr-only') return 120;

  return 500;
}

function getVariantOrder(cls: string): number {
  if (!cls.includes(':')) return 0;
  const prefix = cls.slice(0, cls.lastIndexOf(':'));
  if (RE_BREAKPOINTS.test(prefix)) return 1;
  if (/^(dark|print)$/.test(prefix)) return 2;
  return 3;
}

export function sortClasses(classStr: string): string {
  const classes = classStr.split(/\s+/).filter(Boolean);
  if (classes.length <= 1) return classStr;

  return classes
    .map((cls, i) => ({
      cls,
      cat: getCategory(cls),
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

export function sortFile(filePath: string, opts: ClassStringOpts = {}): number {
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = replaceClassStrings(content, sortClasses, opts);
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
