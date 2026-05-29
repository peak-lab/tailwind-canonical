import { readFileSync, writeFileSync } from 'node:fs';
import { type ClassStringOpts, replaceClassStrings } from './class-strings.js';

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

const SIDE_MAP: Record<string, ReadonlyArray<keyof Box>> = {
  p: ['t', 'b', 'l', 'r'],
  m: ['t', 'b', 'l', 'r'],
  border: ['t', 'b', 'l', 'r'],
  inset: ['t', 'b', 'l', 'r'],
  gap: ['t', 'b', 'l', 'r'],
  'scroll-p': ['t', 'b', 'l', 'r'],
  'scroll-m': ['t', 'b', 'l', 'r'],
  px: ['l', 'r'],
  mx: ['l', 'r'],
  'border-x': ['l', 'r'],
  'inset-x': ['l', 'r'],
  'gap-x': ['l', 'r'],
  'scroll-px': ['l', 'r'],
  'scroll-mx': ['l', 'r'],
  py: ['t', 'b'],
  my: ['t', 'b'],
  'border-y': ['t', 'b'],
  'inset-y': ['t', 'b'],
  'gap-y': ['t', 'b'],
  'scroll-py': ['t', 'b'],
  'scroll-my': ['t', 'b'],
  pt: ['t'],
  mt: ['t'],
  'border-t': ['t'],
  top: ['t'],
  'scroll-pt': ['t'],
  'scroll-mt': ['t'],
  pb: ['b'],
  mb: ['b'],
  'border-b': ['b'],
  bottom: ['b'],
  'scroll-pb': ['b'],
  'scroll-mb': ['b'],
  pl: ['l'],
  ml: ['l'],
  'border-l': ['l'],
  left: ['l'],
  'scroll-pl': ['l'],
  'scroll-ml': ['l'],
  pr: ['r'],
  mr: ['r'],
  'border-r': ['r'],
  right: ['r'],
  'scroll-pr': ['r'],
  'scroll-mr': ['r'],
};

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

function parseRoundedCorner(
  cls: string,
): { corners: Partial<Record<keyof Corners, string>> } | null {
  const sideM = cls.match(/^rounded-(tl|tr|bl|br|t|b|l|r)(?:-(.+))?$/);
  if (sideM) {
    const side = sideM[1];
    const val = sideM[2] ?? '';
    const c: Partial<Record<keyof Corners, string>> = {};
    if (side === 't') {
      c.tl = val;
      c.tr = val;
    } else if (side === 'b') {
      c.bl = val;
      c.br = val;
    } else if (side === 'l') {
      c.tl = val;
      c.bl = val;
    } else if (side === 'r') {
      c.tr = val;
      c.br = val;
    } else {
      c[side as keyof Corners] = val;
    }
    return { corners: c };
  }

  const allM = cls.match(/^rounded(?:-(.+))?$/);
  if (allM) {
    const val = allM[1] ?? '';
    return { corners: { tl: val, tr: val, bl: val, br: val } };
  }

  return null;
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
  if (!handled.tl && !handled.tr && tl !== null && tr !== null && tl === tr) {
    parts.push(mk('rounded-t', tl));
    handled.tl = true;
    handled.tr = true;
  }
  if (!handled.bl && !handled.br && bl !== null && br !== null && bl === br) {
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

// ─── Public API ───────────────────────────────────────────────────────────────

function pushCollapsed(
  result: string[],
  collapsed: string,
  classes: string[],
): void {
  const original = classes.filter((c, i) => classes.indexOf(c) === i).join(' ');
  result.push(
    ...(collapsed === original ? original.split(' ') : collapsed.split(' ')),
  );
}

export function deduplicateClasses(classStr: string): string {
  const classes = classStr.split(/\s+/).filter(Boolean);
  if (classes.length <= 1) return classStr;

  let displayWinner: string | null = null;
  let positionWinner: string | null = null;
  const seen = new Set<string>();
  const others: string[] = [];
  const boxGroups = new Map<
    string,
    { family: BoxFamily; box: Box; classes: string[] }
  >();
  const corners: Corners = { tl: null, tr: null, bl: null, br: null };
  const cornersClasses: string[] = [];

  for (const cls of classes) {
    if (DISPLAY_GROUP.has(cls)) {
      displayWinner = cls;
      continue;
    }
    if (POSITION_GROUP.has(cls)) {
      positionWinner = cls;
      continue;
    }

    const parsed = parseBoxClass(cls);
    if (parsed) {
      const { family, sides } = parsed;
      let group = boxGroups.get(family.kind);
      if (!group) {
        group = { family, box: { t: '', b: '', l: '', r: '' }, classes: [] };
        boxGroups.set(family.kind, group);
      }
      group.classes.push(cls);
      if (sides.t !== undefined) group.box.t = sides.t;
      if (sides.b !== undefined) group.box.b = sides.b;
      if (sides.l !== undefined) group.box.l = sides.l;
      if (sides.r !== undefined) group.box.r = sides.r;
      continue;
    }

    const roundedParsed = parseRoundedCorner(cls);
    if (roundedParsed) {
      cornersClasses.push(cls);
      const { corners: c } = roundedParsed;
      if (c.tl !== undefined) corners.tl = c.tl;
      if (c.tr !== undefined) corners.tr = c.tr;
      if (c.bl !== undefined) corners.bl = c.bl;
      if (c.br !== undefined) corners.br = c.br;
      continue;
    }

    if (!seen.has(cls)) {
      seen.add(cls);
      others.push(cls);
    }
  }

  const result: string[] = [];
  if (displayWinner) result.push(displayWinner);
  if (positionWinner) result.push(positionWinner);

  for (const { family, box, classes: groupClasses } of boxGroups.values()) {
    if (groupClasses.length === 0) continue;
    pushCollapsed(result, collapseBox(box, family), groupClasses);
  }

  if (cornersClasses.length > 0) {
    pushCollapsed(result, collapseCorners(corners), cornersClasses);
  }

  result.push(...others);
  return result.join(' ');
}

export function dedupeFile(
  filePath: string,
  opts: ClassStringOpts = {},
): number {
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = replaceClassStrings(
    content,
    deduplicateClasses,
    opts,
  );
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
