import { type Dirent, readdirSync, statSync } from 'node:fs';
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
  return target.includes('*') || target.includes('?');
}

function globToRegex(pattern: string): RegExp {
  let i = 0;
  let re = '^';
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

function globBase(pattern: string): string {
  const firstGlob = pattern.search(/[*?]/);
  if (firstGlob === -1) return pattern;
  const before = pattern.slice(0, firstGlob);
  const lastSlash = before.lastIndexOf('/');
  return lastSlash === -1 ? '.' : before.slice(0, lastSlash) || '.';
}

export function scanFiles(target: string, options: ScanOptions = {}): string[] {
  const ignore = options.ignore ?? DEFAULT_IGNORE;

  if (isGlob(target)) {
    const regex = globToRegex(target);
    const base = globBase(target);
    const files: string[] = [];

    function walkGlob(current: string, rel: string) {
      let entries: Dirent[];
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (ignore.includes(entry.name)) continue;
        const full = join(current, entry.name);
        const relEntry = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walkGlob(full, relEntry);
        } else if (regex.test(relEntry)) {
          files.push(full);
        }
      }
    }

    walkGlob(base, base === '.' ? '' : base);
    return files;
  }

  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const files: string[] = [];

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true });
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
