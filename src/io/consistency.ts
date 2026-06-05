import { readFileSync } from 'node:fs';
import { toClassStringOpts } from '../core/class-strings.js';
import {
  analyzeConsistency,
  type ConsistencyOptions,
  type ConsistencyReport,
  collectClasses,
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
      input.push({
        file,
        classes: collectClasses(readFileSync(file, 'utf8'), opts),
      });
    } catch (err) {
      if (onError) onError(file, err);
    }
  }
  return analyzeConsistency(input, options);
}
