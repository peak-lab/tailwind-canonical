import { readFileSync, writeFileSync } from 'node:fs';

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

function getCategory(cls: string): number {
  const base = cls.includes(':') ? cls.slice(cls.lastIndexOf(':') + 1) : cls;

  if (
    base === 'container' ||
    /^(overflow|overscroll|object|float|clear|isolation|box|columns)[-]/.test(
      base,
    )
  )
    return 0;

  if (POSITION_CLASSES.has(base)) return 10;
  if (/^(inset|top|right|bottom|left|z)[-]/.test(base)) return 15;

  if (DISPLAY_CLASSES.has(base)) return 20;

  if (
    base === 'grow' ||
    base === 'shrink' ||
    /^(flex|grid|col|row|auto-cols|auto-rows|justify|items|content|self|place|grow|shrink|order|gap|space)[-]/.test(
      base,
    )
  )
    return 25;

  if (/^(aspect|size|w|h|min-w|max-w|min-h|max-h)[-]/.test(base)) return 30;

  if (
    base === 'rounded' ||
    base === 'border' ||
    base === 'ring' ||
    base === 'outline' ||
    /^(rounded|border|ring|outline|divide)[-]/.test(base)
  )
    return 40;

  if (/^(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me)[-]/.test(base))
    return 50;

  if (
    TEXT_SIZES.test(base) ||
    /^(font|leading|tracking|line-clamp|decoration|list|whitespace)[-]/.test(
      base,
    ) ||
    TYPOGRAPHY_KEYWORDS.has(base)
  )
    return 60;

  if (/^(text|bg|from|to|via|fill|stroke|caret|accent)[-]/.test(base))
    return 70;

  if (
    base === 'shadow' ||
    base === 'blur' ||
    ['grayscale', 'invert', 'sepia'].includes(base) ||
    /^(opacity|shadow|blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|backdrop|mix-blend|bg-blend)[-]/.test(
      base,
    )
  )
    return 80;

  if (
    base === 'transition' ||
    /^(transition|duration|ease|delay|animate|will-change)[-]/.test(base)
  )
    return 90;

  if (/^(scale|rotate|translate|skew|origin)[-]/.test(base)) return 100;

  if (
    /^(cursor|pointer-events|select|appearance|resize|scroll|snap|touch)[-]/.test(
      base,
    )
  )
    return 110;

  if (base === 'sr-only' || base === 'not-sr-only') return 120;

  return 500;
}

function getVariantOrder(cls: string): number {
  if (!cls.includes(':')) return 0;
  const prefix = cls.slice(0, cls.lastIndexOf(':'));
  if (/^(sm|md|lg|xl|2xl)$/.test(prefix)) return 1;
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

export function sortFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf8');
  let count = 0;

  const CLASS_ATTR_REGEX = /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

  content = content.replace(CLASS_ATTR_REGEX, (full, dq, sq, bt) => {
    const raw = dq ?? sq ?? bt ?? '';
    const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : '`';
    const sorted = sortClasses(raw);
    if (sorted === raw) return full;
    count++;
    return `className=${quote}${sorted}${quote}`;
  });

  if (count > 0) writeFileSync(filePath, content, 'utf8');
  return count;
}
