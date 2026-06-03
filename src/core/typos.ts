import { readFileSync } from 'node:fs';
import {
  type ClassStringOpts,
  extractClassStrings,
  SINGLE_CLASS_REGEX,
} from './class-strings.js';
import { COLOR_PROPERTIES, TAILWIND_COLORS } from './lexicon.js';
import type { Config } from './rules.js';
import { getSuppressedLines, lineAt } from './suppressions.js';

export type TypoFinding = {
  file: string;
  line: number;
  col: number;
  original: string;
  suggestion: string;
};

const MIN_COLOR_LEN = 3;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

function nearestColor(name: string): string | null {
  if (name.length < MIN_COLOR_LEN) return null;
  for (const color of TAILWIND_COLORS) {
    if (Math.abs(color.length - name.length) > 1) continue;
    if (levenshtein(name, color) === 1) return color;
  }
  return null;
}

export function detectTypo(cls: string): { suggestion: string } | null {
  const colon = cls.lastIndexOf(':');
  const prefix = colon === -1 ? '' : cls.slice(0, colon + 1);
  const base = colon === -1 ? cls : cls.slice(colon + 1);

  if (base.includes('[')) return null;

  const dash = base.indexOf('-');
  if (dash === -1) return null;
  const property = base.slice(0, dash);
  if (!COLOR_PROPERTIES.has(property)) return null;

  const rest = base.slice(dash + 1);
  const lastDash = rest.lastIndexOf('-');
  let color = rest;
  let shade = '';
  if (lastDash !== -1 && /^\d+$/.test(rest.slice(lastDash + 1))) {
    color = rest.slice(0, lastDash);
    shade = rest.slice(lastDash + 1);
  }

  if (TAILWIND_COLORS.has(color)) return null;

  const near = nearestColor(color);
  if (!near) return null;

  const suggestion = `${prefix}${property}-${near}${shade ? `-${shade}` : ''}`;
  return { suggestion };
}

export function analyzeTyposFile(
  filePath: string,
  config: Config = {},
): TypoFinding[] {
  const content = readFileSync(filePath, 'utf8');
  const findings: TypoFinding[] = [];
  const suppressed = getSuppressedLines(content);
  const opts: ClassStringOpts = {
    functionNames: config.functionNames,
    attributeNames: config.attributeNames,
  };

  for (const { value, start } of extractClassStrings(content, opts)) {
    for (const clsMatch of value.matchAll(SINGLE_CLASS_REGEX)) {
      const typo = detectTypo(clsMatch[0]);
      if (!typo) continue;
      const index = start + (clsMatch.index ?? 0);
      const line = lineAt(content, index);
      if (suppressed.has(line)) continue;
      const col = index - content.lastIndexOf('\n', index - 1);
      findings.push({
        file: filePath,
        line,
        col,
        original: clsMatch[0],
        suggestion: typo.suggestion,
      });
    }
  }

  return findings;
}
