import { readFileSync } from 'node:fs';
import {
  type ClassStringOpts,
  extractClassStrings,
  SINGLE_CLASS_REGEX,
} from './class-strings.js';
import { type Config, type Suggestion, suggestCanonical } from './rules.js';
import { getSuppressedLines } from './suppressions.js';

export type Finding = {
  file: string;
  line: number;
  col: number;
  suggestion: Suggestion;
};

function indexToLineCol(
  content: string,
  index: number,
): { line: number; col: number } {
  const before = content.slice(0, index);
  const line = before.split('\n').length;
  const col = index - before.lastIndexOf('\n');
  return { line, col };
}

export function analyzeFile(filePath: string, config: Config = {}): Finding[] {
  const content = readFileSync(filePath, 'utf8');
  const findings: Finding[] = [];
  const suppressed = getSuppressedLines(content);
  const opts: ClassStringOpts = {
    functionNames: config.functionNames,
    attributeNames: config.attributeNames,
  };

  for (const { value, start } of extractClassStrings(content, opts)) {
    for (const clsMatch of value.matchAll(SINGLE_CLASS_REGEX)) {
      const suggestion = suggestCanonical(clsMatch[0], config);
      if (!suggestion) continue;
      const index = start + (clsMatch.index ?? 0);
      const { line, col } = indexToLineCol(content, index);
      if (suppressed.has(line)) continue;
      findings.push({ file: filePath, line, col, suggestion });
    }
  }

  return findings;
}
