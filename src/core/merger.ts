import { readFileSync, writeFileSync } from 'node:fs';
import { type ClassStringOpts, replaceClassStrings } from './class-strings.js';

export async function mergeFile(
  filePath: string,
  opts: ClassStringOpts = {},
): Promise<number> {
  const { twMerge } = await import('tailwind-merge');
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = replaceClassStrings(content, twMerge, opts);
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
