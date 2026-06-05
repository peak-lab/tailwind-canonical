import { readFileSync, writeFileSync } from 'node:fs';
import type { ClassStringOpts } from '../core/class-strings.js';
import { dedupeContent } from '../core/deduplicator.js';

export function dedupeFile(
  filePath: string,
  opts: ClassStringOpts = {},
): number {
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = dedupeContent(content, opts);
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
