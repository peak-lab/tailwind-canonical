import { readFileSync, writeFileSync } from 'node:fs';
import type { ClassStringOpts } from '../core/class-strings.js';
import { type SortCategory, sortContent } from '../core/sorter.js';

export function sortFile(
  filePath: string,
  opts: ClassStringOpts = {},
  sortOrder?: SortCategory[],
): number {
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = sortContent(content, opts, sortOrder);
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
