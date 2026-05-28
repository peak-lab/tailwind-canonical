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

function expandSpacing(prefix: string, suffix: string): Partial<Box> | null {
  if (prefix === 'p' || prefix === 'm')
    return { t: suffix, b: suffix, l: suffix, r: suffix };
  if (prefix === 'px' || prefix === 'mx') return { l: suffix, r: suffix };
  if (prefix === 'py' || prefix === 'my') return { t: suffix, b: suffix };
  if (prefix === 'pt' || prefix === 'mt') return { t: suffix };
  if (prefix === 'pb' || prefix === 'mb') return { b: suffix };
  if (prefix === 'pl' || prefix === 'ml') return { l: suffix };
  if (prefix === 'pr' || prefix === 'mr') return { r: suffix };
  return null;
}

function collapseBox(box: Box, kind: 'p' | 'm'): string {
  const { t, b, l, r } = box;

  if (t && b && l && r) {
    if (t === b && b === l && l === r) return `${kind}-${t}`;
    if (t === b && l === r) return `${kind}y-${t} ${kind}x-${l}`;
    if (l === r) return `${kind}x-${l} ${kind}t-${t} ${kind}b-${b}`;
    if (t === b) return `${kind}y-${t} ${kind}l-${l} ${kind}r-${r}`;
    return `${kind}t-${t} ${kind}b-${b} ${kind}l-${l} ${kind}r-${r}`;
  }

  const parts: string[] = [];
  if (l && r) {
    parts.push(l === r ? `${kind}x-${l}` : `${kind}l-${l} ${kind}r-${r}`);
  } else {
    if (l) parts.push(`${kind}l-${l}`);
    if (r) parts.push(`${kind}r-${r}`);
  }
  if (t && b) {
    parts.push(t === b ? `${kind}y-${t}` : `${kind}t-${t} ${kind}b-${b}`);
  } else {
    if (t) parts.push(`${kind}t-${t}`);
    if (b) parts.push(`${kind}b-${b}`);
  }
  return parts.join(' ');
}

function parseSpacing(
  cls: string,
): { kind: 'p' | 'm'; prefix: string; suffix: string } | null {
  const m = cls.match(/^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-(.+)$/);
  if (!m) return null;
  const kind = m[1].startsWith('p') ? 'p' : 'm';
  return { kind, prefix: m[1], suffix: m[2] };
}

function processSpacingGroup(
  classes: string[],
  box: Box,
  kind: 'p' | 'm',
): string[] {
  if (classes.length === 0) return [];
  const collapsed = collapseBox(box, kind);
  const original = classes.filter((c, i) => classes.indexOf(c) === i).join(' ');
  return collapsed === original ? original.split(' ') : collapsed.split(' ');
}

export function deduplicateClasses(classStr: string): string {
  const classes = classStr.split(/\s+/).filter(Boolean);
  if (classes.length <= 1) return classStr;

  const result: string[] = [];
  let displayWinner: string | null = null;
  let positionWinner: string | null = null;
  const seen = new Set<string>();

  const pBox: Box = { t: '', b: '', l: '', r: '' };
  const mBox: Box = { t: '', b: '', l: '', r: '' };
  const pClasses: string[] = [];
  const mClasses: string[] = [];
  const others: string[] = [];

  for (const cls of classes) {
    if (DISPLAY_GROUP.has(cls)) {
      displayWinner = cls;
      continue;
    }
    if (POSITION_GROUP.has(cls)) {
      positionWinner = cls;
      continue;
    }

    const sp = parseSpacing(cls);
    if (sp) {
      const expansion = expandSpacing(sp.prefix, sp.suffix);
      if (expansion) {
        const box = sp.kind === 'p' ? pBox : mBox;
        (sp.kind === 'p' ? pClasses : mClasses).push(cls);
        if (expansion.t !== undefined) box.t = expansion.t;
        if (expansion.b !== undefined) box.b = expansion.b;
        if (expansion.l !== undefined) box.l = expansion.l;
        if (expansion.r !== undefined) box.r = expansion.r;
        continue;
      }
    }

    if (!seen.has(cls)) {
      seen.add(cls);
      others.push(cls);
    }
  }

  if (displayWinner) result.push(displayWinner);
  if (positionWinner) result.push(positionWinner);
  result.push(...processSpacingGroup(pClasses, pBox, 'p'));
  result.push(...processSpacingGroup(mClasses, mBox, 'm'));
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
