import { readFileSync, writeFileSync } from 'node:fs';
import { fixContent } from '../core/fixer.js';
import type { Config } from '../core/rules.js';

export function fixFile(filePath: string, config: Config = {}): number {
  const content = readFileSync(filePath, 'utf8');
  const { result, count } = fixContent(content, config);
  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
