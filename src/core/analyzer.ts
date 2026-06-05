import {
  extractClassStrings,
  SINGLE_CLASS_REGEX,
  toClassStringOpts,
} from './class-strings.js';
import { type Config, type Suggestion, suggestCanonical } from './rules.js';
import { getSuppressedLines, indexToLineCol } from './suppressions.js';

export type Finding = {
  file: string;
  line: number;
  col: number;
  suggestion: Suggestion;
};

export function analyzeContent(
  filePath: string,
  content: string,
  config: Config = {},
): Finding[] {
  const findings: Finding[] = [];
  const suppressed = getSuppressedLines(content);
  const opts = toClassStringOpts(config);

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

export { analyzeFile } from '../io/analyzer.js';
