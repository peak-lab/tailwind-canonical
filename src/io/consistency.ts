import { readFileSync } from 'node:fs';
import {
  extractClassStrings,
  SINGLE_CLASS_REGEX,
  toClassStringOpts,
} from '../core/class-strings.js';
import {
  analyzeConsistency,
  type ConsistencyOptions,
  type ConsistencyReport,
  type FileClasses,
} from '../core/consistency.js';
import type { Config } from '../core/rules.js';

export function analyzeConsistencyFiles(
  filePaths: string[],
  config: Config = {},
  options: ConsistencyOptions = {},
  onError?: (file: string, err: unknown) => void,
): ConsistencyReport {
  const opts = toClassStringOpts(config);
  const input: FileClasses[] = [];
  for (const file of filePaths) {
    try {
      const classLists = extractClassStrings(
        readFileSync(file, 'utf8'),
        opts,
      ).map(({ value }) =>
        [...value.matchAll(SINGLE_CLASS_REGEX)].map((match) => match[0]),
      );
      input.push({ file, classes: classLists.flat(), classLists });
    } catch (err) {
      if (onError) onError(file, err);
    }
  }
  return analyzeConsistency(input, options);
}
