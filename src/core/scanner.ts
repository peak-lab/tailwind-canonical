import { type Dirent, readdirSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte'];
const DEFAULT_IGNORE = [
  'node_modules',
  '.next',
  'dist',
  '.git',
  'build',
  'coverage',
];

export type ScanOptions = {
  extensions?: string[];
  ignore?: string[];
};

function isGlob(target: string): boolean {
  return target.includes('*') || target.includes('?') || target.includes('{');
}

function globToRegex(pattern: string): RegExp {
  let i = 0;
  const anchored = pattern.startsWith('/') || /^[A-Za-z]:/.test(pattern);
  let re = anchored ? '^' : '(?:^|/)';
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (c === '*') {
      re += '[^/]*';
      i++;
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else if (c === '{') {
      const close = pattern.indexOf('}', i);
      if (close === -1) {
        re += '\\{';
        i++;
      } else {
        const alts = pattern
          .slice(i + 1, close)
          .split(',')
          .map((a) => a.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
        re += `(?:${alts.join('|')})`;
        i = close + 1;
      }
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += `\\${c}`;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp(`${re}$`);
}

export function scanFiles(target: string, options: ScanOptions = {}): string[] {
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const files: string[] = [];

  function walk(current: string) {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  }

  const stat = statSync(target);
  if (stat.isFile())
    return extensions.some((ext) => target.endsWith(ext)) ? [target] : [];
  walk(target);
  return files;
}

export async function resolveTargets(
  patterns: string[],
  options: ScanOptions = {},
): Promise<string[]> {
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;

  const positive: string[] = [];
  const negativeRegexes: RegExp[] = [];

  for (const p of patterns) {
    if (p.startsWith('!')) {
      negativeRegexes.push(globToRegex(p.slice(1)));
    } else {
      positive.push(p);
    }
  }

  const files = new Set<string>();

  for (const pattern of positive) {
    if (isGlob(pattern)) {
      for await (const f of glob(pattern, {
        exclude: (f) =>
          f
            .replace(/\\/g, '/')
            .split('/')
            .some((s) => ignore.includes(s)),
      })) {
        if (extensions.some((ext) => f.endsWith(ext))) {
          files.add(f);
        }
      }
    } else {
      for (const f of scanFiles(pattern, options)) {
        files.add(f);
      }
    }
  }

  if (negativeRegexes.length > 0) {
    for (const f of [...files]) {
      const normalized = f.replace(/\\/g, '/');
      if (negativeRegexes.some((re) => re.test(normalized))) {
        files.delete(f);
      }
    }
  }

  return [...files].sort();
}
