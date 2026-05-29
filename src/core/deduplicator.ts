import { readFileSync, writeFileSync } from 'node:fs';

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
  px: ['l', 'r'],
  mx: ['l', 'r'],
  'border-x': ['l', 'r'],
  'inset-x': ['l', 'r'],
  py: ['t', 'b'],
  my: ['t', 'b'],
  'border-y': ['t', 'b'],
  'inset-y': ['t', 'b'],
  pt: ['t'],
  mt: ['t'],
  'border-t': ['t'],
  top: ['t'],
  pb: ['b'],
  mb: ['b'],
  'border-b': ['b'],
  bottom: ['b'],
  pl: ['l'],
  ml: ['l'],
  'border-l': ['l'],
  left: ['l'],
  pr: ['r'],
  mr: ['r'],
  'border-r': ['r'],
  right: ['r'],
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
    const collapsed = collapseBox(box, family);
    const original = groupClasses
      .filter((c, i) => groupClasses.indexOf(c) === i)
      .join(' ');
    result.push(
      ...(collapsed === original ? original.split(' ') : collapsed.split(' ')),
    );
  }

  result.push(...others);
  return result.join(' ');
}

export function dedupeFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf8');
  let count = 0;

  const CLASS_ATTR_REGEX = /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

  content = content.replace(CLASS_ATTR_REGEX, (full, dq, sq, bt) => {
    const raw = dq ?? sq ?? bt ?? '';
    const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : '`';
    const deduped = deduplicateClasses(raw);
    if (deduped === raw) return full;
    count++;
    return `className=${quote}${deduped}${quote}`;
  });

  if (count > 0) writeFileSync(filePath, content, 'utf8');
  return count;
}
