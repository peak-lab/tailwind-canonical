import { readFileSync, writeFileSync } from 'node:fs';
import type { ClassStringOpts } from '../core/class-strings.js';
import { mergeContent } from '../core/merger.js';

export async function mergeFile(
  filePath: string,
  opts: ClassStringOpts = {},
): Promise<number> {
  const { twMerge } = await import('tailwind-merge');
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = mergeContent(content, twMerge, opts);
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
