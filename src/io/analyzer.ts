import { readFileSync } from 'node:fs';
import { analyzeContent, type Finding } from '../core/analyzer.js';
import type { Config } from '../core/rules.js';

export function analyzeFile(filePath: string, config: Config = {}): Finding[] {
  const content = readFileSync(filePath, 'utf8');
  return analyzeContent(filePath, content, config);
}
