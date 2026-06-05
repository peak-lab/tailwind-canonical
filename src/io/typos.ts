import { readFileSync } from 'node:fs';
import type { Config } from '../core/rules.js';
import { analyzeTyposContent, type TypoFinding } from '../core/typos.js';

export function analyzeTyposFile(
  filePath: string,
  config: Config = {},
): TypoFinding[] {
  const content = readFileSync(filePath, 'utf8');
  return analyzeTyposContent(filePath, content, config);
}
