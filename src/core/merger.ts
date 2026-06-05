import { type ClassStringOpts, replaceClassStrings } from './class-strings.js';
import { makeLineSuppressor } from './suppressions.js';

export function mergeContent(
  content: string,
  twMerge: (classes: string) => string,
  opts: ClassStringOpts = {},
): { result: string; count: number } {
  return replaceClassStrings(content, twMerge, {
    ...opts,
    isSuppressed: makeLineSuppressor(content),
  });
}

export { mergeFile } from '../io/merger.js';
