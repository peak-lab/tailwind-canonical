import { type Dirent, readdirSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_IGNORE,
  globToRegex,
  isGlob,
  type ScanOptions,
} from '../core/scanner.js';

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
        exclude: (entry) =>
          entry
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
