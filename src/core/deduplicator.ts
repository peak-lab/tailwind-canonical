import { type ClassStringOpts, replaceClassStrings } from './class-strings.js';
import { makeLineSuppressor } from './suppressions.js';

const DISPLAY_GROUP = new Set([
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-footer-group',
  'table-header-group',
  'table-row-group',
  'table-row',
  'flow-root',
  'grid',
  'inline-grid',
  'contents',
  'list-item',
  'hidden',
]);

const POSITION_GROUP = new Set([
  'static',
  'fixed',
  'absolute',
  'relative',
  'sticky',
]);

// ─── Box families ────────────────────────────────────────────────────────────

type Box = { t: string; b: string; l: string; r: string };

interface BoxFamily {
  kind: string;
  full: string;
  x: string;
  y: string;
  t: string;
  b: string;
  l: string;
  r: string;
  regex: RegExp;
}

const FAMILIES: BoxFamily[] = [
  {
    kind: 'p',
    full: 'p',
    x: 'px',
    y: 'py',
    t: 'pt',
    b: 'pb',
    l: 'pl',
    r: 'pr',
    regex: /^(p|px|py|pt|pb|pl|pr)-(.+)$/,
  },
  {
    kind: 'm',
    full: 'm',
    x: 'mx',
    y: 'my',
    t: 'mt',
    b: 'mb',
    l: 'ml',
    r: 'mr',
    regex: /^(m|mx|my|mt|mb|ml|mr)-(.+)$/,
  },
  {
    kind: 'border-width',
    full: 'border',
    x: 'border-x',
    y: 'border-y',
    t: 'border-t',
    b: 'border-b',
    l: 'border-l',
    r: 'border-r',
    regex:
      /^(border|border-x|border-y|border-t|border-b|border-l|border-r)-(\d.*)$/,
  },
  {
    kind: 'inset',
    full: 'inset',
    x: 'inset-x',
    y: 'inset-y',
    t: 'top',
    b: 'bottom',
    l: 'left',
    r: 'right',
    regex: /^(inset-x|inset-y|inset|top|bottom|left|right)-(.+)$/,
  },
  {
    // gap has no per-side utilities (no gap-t/gap-l). It reuses the generic
    // BoxFamily machinery purely to collapse the two axes gap-x + gap-y → gap.
    // The t/b/l/r slots map onto the axes (t/b → gap-y, l/r → gap-x) only so
    // the shared SIDE_MAP/collapse logic resolves; they are never emitted.
    kind: 'gap',
    full: 'gap',
    x: 'gap-x',
    y: 'gap-y',
    t: 'gap-y',
    b: 'gap-y',
    l: 'gap-x',
    r: 'gap-x',
    regex: /^(gap-x|gap-y|gap)-(.+)$/,
  },
  {
    kind: 'scroll-p',
    full: 'scroll-p',
    x: 'scroll-px',
    y: 'scroll-py',
    t: 'scroll-pt',
    b: 'scroll-pb',
    l: 'scroll-pl',
    r: 'scroll-pr',
    regex:
      /^(scroll-p|scroll-px|scroll-py|scroll-pt|scroll-pb|scroll-pl|scroll-pr)-(.+)$/,
  },
  {
    kind: 'scroll-m',
    full: 'scroll-m',
    x: 'scroll-mx',
    y: 'scroll-my',
    t: 'scroll-mt',
    b: 'scroll-mb',
    l: 'scroll-ml',
    r: 'scroll-mr',
    regex:
      /^(scroll-m|scroll-mx|scroll-my|scroll-mt|scroll-mb|scroll-ml|scroll-mr)-(.+)$/,
  },
];

const SIDE_MAP: Record<string, ReadonlyArray<keyof Box>> = {};
for (const f of FAMILIES) {
  const entries: Array<[string, ReadonlyArray<keyof Box>]> = [
    [f.full, ['t', 'b', 'l', 'r']],
    [f.x, ['l', 'r']],
    [f.y, ['t', 'b']],
    [f.t, ['t']],
    [f.b, ['b']],
    [f.l, ['l']],
    [f.r, ['r']],
  ];
  for (const [prefix, sides] of entries) SIDE_MAP[prefix] ??= sides;
}

function parseBoxClass(
  cls: string,
): { family: BoxFamily; sides: Partial<Box> } | null {
  for (const family of FAMILIES) {
    const m = cls.match(family.regex);
    if (!m) continue;
    const sides: Partial<Box> = {};
    for (const side of SIDE_MAP[m[1]] ?? []) sides[side] = m[2];
    return { family, sides };
  }
  return null;
}

function collapseBox(box: Box, f: BoxFamily): string {
  const { t, b, l, r } = box;
  const fmt = (pfx: string, val: string) => `${pfx}-${val}`;

  if (t && b && l && r) {
    if (t === b && b === l && l === r) return fmt(f.full, t);
    if (t === b && l === r) return `${fmt(f.y, t)} ${fmt(f.x, l)}`;
    if (l === r) return `${fmt(f.x, l)} ${fmt(f.t, t)} ${fmt(f.b, b)}`;
    if (t === b) return `${fmt(f.y, t)} ${fmt(f.l, l)} ${fmt(f.r, r)}`;
    return `${fmt(f.t, t)} ${fmt(f.b, b)} ${fmt(f.l, l)} ${fmt(f.r, r)}`;
  }

  const parts: string[] = [];
  if (l && r) {
    parts.push(l === r ? fmt(f.x, l) : `${fmt(f.l, l)} ${fmt(f.r, r)}`);
  } else {
    if (l) parts.push(fmt(f.l, l));
    if (r) parts.push(fmt(f.r, r));
  }
  if (t && b) {
    parts.push(t === b ? fmt(f.y, t) : `${fmt(f.t, t)} ${fmt(f.b, b)}`);
  } else {
    if (t) parts.push(fmt(f.t, t));
    if (b) parts.push(fmt(f.b, b));
  }
  return parts.join(' ');
}

// ─── Rounded corner families ──────────────────────────────────────────────────

type Corners = {
  tl: string | null;
  tr: string | null;
  bl: string | null;
  br: string | null;
};

type Corner = keyof Corners;

const CORNER_MAP: Record<string, ReadonlyArray<Corner>> = {
  '': ['tl', 'tr', 'bl', 'br'],
  t: ['tl', 'tr'],
  b: ['bl', 'br'],
  l: ['tl', 'bl'],
  r: ['tr', 'br'],
  tl: ['tl'],
  tr: ['tr'],
  bl: ['bl'],
  br: ['br'],
};

function parseRoundedCorner(
  cls: string,
): Partial<Record<Corner, string>> | null {
  const m =
    cls.match(/^rounded-(tl|tr|bl|br|t|b|l|r)(?:-(.+))?$/) ??
    cls.match(/^rounded()(?:-(.+))?$/);
  if (!m) return null;
  const value = m[2] ?? '';
  const corners: Partial<Record<Corner, string>> = {};
  for (const corner of CORNER_MAP[m[1]]) corners[corner] = value;
  return corners;
}

function collapseCorners(c: Corners): string {
  const { tl, tr, bl, br } = c;
  const mk = (pfx: string, val: string) => (val === '' ? pfx : `${pfx}-${val}`);

  if (tl !== null && tr !== null && bl !== null && br !== null) {
    if (tl === tr && tr === bl && bl === br) return mk('rounded', tl);
    if (tl === tr && bl === br)
      return `${mk('rounded-t', tl)} ${mk('rounded-b', bl)}`;
    if (tl === bl && tr === br)
      return `${mk('rounded-l', tl)} ${mk('rounded-r', tr)}`;
    const parts: string[] = [];
    if (tl === tr) parts.push(mk('rounded-t', tl));
    else {
      parts.push(mk('rounded-tl', tl));
      parts.push(mk('rounded-tr', tr));
    }
    if (bl === br) parts.push(mk('rounded-b', bl));
    else {
      parts.push(mk('rounded-bl', bl));
      parts.push(mk('rounded-br', br));
    }
    return parts.join(' ');
  }

  const handled = { tl: false, tr: false, bl: false, br: false };
  const parts: string[] = [];
  if (tl !== null && bl !== null && tl === bl) {
    parts.push(mk('rounded-l', tl));
    handled.tl = true;
    handled.bl = true;
  }
  if (tr !== null && br !== null && tr === br) {
    parts.push(mk('rounded-r', tr));
    handled.tr = true;
    handled.br = true;
  }
  if (!(handled.tl || handled.tr) && tl !== null && tr !== null && tl === tr) {
    parts.push(mk('rounded-t', tl));
    handled.tl = true;
    handled.tr = true;
  }
  if (!(handled.bl || handled.br) && bl !== null && br !== null && bl === br) {
    parts.push(mk('rounded-b', bl));
    handled.bl = true;
    handled.br = true;
  }
  if (!handled.tl && tl !== null) parts.push(mk('rounded-tl', tl));
  if (!handled.tr && tr !== null) parts.push(mk('rounded-tr', tr));
  if (!handled.bl && bl !== null) parts.push(mk('rounded-bl', bl));
  if (!handled.br && br !== null) parts.push(mk('rounded-br', br));
  return parts.join(' ');
}

// ─── Responsive cascade collapse ─────────────────────────────────────────────

const RESPONSIVE_BREAKPOINTS = ['sm', 'md', 'lg', 'xl', '2xl'] as const;

type Breakpoint = (typeof RESPONSIVE_BREAKPOINTS)[number] | '';

// Exhaustive by type: adding a breakpoint above fails the build until ranked.
const BP_RANK: Record<Breakpoint, number> = {
  '': 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  '2xl': 5,
};

function collapseResponsiveCascade(classes: string[]): string[] {
  interface Entry {
    bp: Breakpoint;
    base: string;
    idx: number;
  }

  const entries: Entry[] = classes.map((cls, idx) => {
    for (const bp of RESPONSIVE_BREAKPOINTS) {
      const prefix = `${bp}:`;
      if (cls.startsWith(prefix) && !cls.slice(prefix.length).includes(':')) {
        const base = cls.slice(prefix.length);
        return { bp, base, idx };
      }
    }
    return { bp: '', base: cls, idx };
  });

  // Unknown variants cannot be ordered against the standard breakpoints safely.
  if (entries.some((entry) => entry.base.includes(':'))) return classes;
  if (!entries.some((entry) => entry.bp !== '')) return classes;

  const sorted = [...entries].sort(
    (a, b) => BP_RANK[a.bp] - BP_RANK[b.bp] || a.idx - b.idx,
  );
  const toRemove = new Set<number>();
  let prev: string | null = null;
  for (const entry of sorted) {
    if (entry.base === prev) toRemove.add(entry.idx);
    else prev = entry.base;
  }

  return classes.filter((_, i) => !toRemove.has(i));
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Survivors keep their slot; new shorthands take the slot of the first token
// they replace, so an unchanged group leaves the string byte-for-byte intact.
function placeCollapsed(
  slots: string[][],
  classes: string[],
  indices: number[],
  collapsed: string,
): void {
  const firstIndex = new Map<string, number>();
  for (const i of indices) {
    if (!firstIndex.has(classes[i])) firstIndex.set(classes[i], i);
  }
  const kept = new Set<number>();
  const fresh: string[] = [];
  for (const token of collapsed.split(' ')) {
    const i = firstIndex.get(token);
    if (i === undefined) fresh.push(token);
    else kept.add(i);
  }
  for (const i of indices) slots[i] = kept.has(i) ? [classes[i]] : [];
  if (fresh.length === 0) return;
  const anchor = indices.find((i) => !kept.has(i)) ?? indices[0];
  slots[anchor] = [...slots[anchor], ...fresh];
}

function keepLastOf(slots: string[][], indices: number[]): void {
  for (const i of indices.slice(0, -1)) slots[i] = [];
}

export function deduplicateClasses(classStr: string): string {
  const original = classStr.split(/\s+/).filter(Boolean);
  if (original.length <= 1) return classStr;

  const classes = collapseResponsiveCascade(original);
  const slots: string[][] = classes.map((cls) => [cls]);

  const displayIndices: number[] = [];
  const positionIndices: number[] = [];
  const seen = new Set<string>();
  const boxGroups = new Map<
    string,
    { family: BoxFamily; box: Box; indices: number[] }
  >();
  const corners: Corners = { tl: null, tr: null, bl: null, br: null };
  const cornerIndices: number[] = [];

  classes.forEach((cls, idx) => {
    if (DISPLAY_GROUP.has(cls)) {
      displayIndices.push(idx);
      return;
    }
    if (POSITION_GROUP.has(cls)) {
      positionIndices.push(idx);
      return;
    }

    const parsed = parseBoxClass(cls);
    if (parsed) {
      const { family, sides } = parsed;
      let group = boxGroups.get(family.kind);
      if (!group) {
        group = { family, box: { t: '', b: '', l: '', r: '' }, indices: [] };
        boxGroups.set(family.kind, group);
      }
      group.indices.push(idx);
      Object.assign(group.box, sides);
      return;
    }

    const roundedCorners = parseRoundedCorner(cls);
    if (roundedCorners) {
      cornerIndices.push(idx);
      Object.assign(corners, roundedCorners);
      return;
    }

    if (seen.has(cls)) slots[idx] = [];
    else seen.add(cls);
  });

  keepLastOf(slots, displayIndices);
  keepLastOf(slots, positionIndices);

  for (const { family, box, indices } of boxGroups.values()) {
    placeCollapsed(slots, classes, indices, collapseBox(box, family));
  }

  if (cornerIndices.length > 0) {
    placeCollapsed(slots, classes, cornerIndices, collapseCorners(corners));
  }

  const result = slots.flat();
  const unchanged =
    result.length === original.length &&
    result.every((cls, i) => cls === original[i]);
  return unchanged ? classStr : result.join(' ');
}

export function dedupeContent(
  content: string,
  opts: ClassStringOpts = {},
): { result: string; count: number } {
  return replaceClassStrings(content, deduplicateClasses, {
    ...opts,
    isSuppressed: makeLineSuppressor(content),
  });
}

export { dedupeFile } from '../io/deduplicator.js';
