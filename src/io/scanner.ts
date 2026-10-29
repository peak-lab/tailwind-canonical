import {
  accessSync,
  constants,
  type Dirent,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { glob } from 'node:fs/promises';
import { isAbsolute, join, matchesGlob, relative, resolve } from 'node:path';
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_IGNORE,
  isGlob,
  type ScanOptions,
} from '../core/scanner.js';

function missing(error: unknown): boolean {
  return ['ENOENT', 'ENOTDIR'].includes(
    (error as NodeJS.ErrnoException).code ?? '',
  );
}

export function scanFiles(target: string, options: ScanOptions = {}): string[] {
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const files: string[] = [];

  function walk(current: string) {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        extensions.some((ext) => entry.name.endsWith(ext))
      ) {
        files.push(full);
      }
    }
  }

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(target);
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
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
  const negativePatterns: string[] = [];

  for (const p of patterns) {
    if (p.startsWith('!')) {
      negativePatterns.push(p.slice(1).replace(/\\/g, '/'));
    } else {
      positive.push(p);
    }
  }

  const files = new Set<string>();

  for (const pattern of positive) {
    if (isGlob(pattern) && !existsSync(pattern)) {
      for await (const entry of glob(pattern, {
        withFileTypes: true,
        exclude: (entry) => {
          const path = join(entry.parentPath, entry.name);
          if (
            path
              .replace(/\\/g, '/')
              .split('/')
              .some((part) => ignore.includes(part))
          )
            return true;
          if (entry.isDirectory()) {
            try {
              // fs.glob otherwise silently swallows unreadable directories,
              // producing a falsely clean, partial scan.
              accessSync(path, constants.R_OK | constants.X_OK);
            } catch (error) {
              if (missing(error)) return true;
              throw error;
            }
          }
          return false;
        },
      })) {
        if (
          !(
            entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))
          )
        )
          continue;
        const path = join(entry.parentPath, entry.name);
        files.add(isAbsolute(pattern) ? path : relative(process.cwd(), path));
      }
    } else {
      for (const f of scanFiles(pattern, options)) {
        files.add(f);
      }
    }
  }

  if (negativePatterns.length > 0) {
    const exclusions = negativePatterns.map((pattern) => ({
      pattern,
      literal: existsSync(pattern)
        ? resolve(pattern).replace(/\\/g, '/')
        : undefined,
    }));
    for (const f of [...files]) {
      const normalized = f.replace(/\\/g, '/');
      if (
        exclusions.some(({ pattern, literal }) => {
          if (literal) {
            const full = resolve(f).replace(/\\/g, '/');
            return (
              full === literal ||
              full.startsWith(literal.endsWith('/') ? literal : `${literal}/`)
            );
          }
          return (
            matchesGlob(normalized, pattern) ||
            (!isAbsolute(pattern) && matchesGlob(normalized, `**/${pattern}`))
          );
        })
      ) {
        files.delete(f);
      }
    }
  }

  return [...files].sort();
}
