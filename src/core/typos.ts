import {
  extractClassStrings,
  SINGLE_CLASS_REGEX,
  toClassStringOpts,
} from './class-strings.js';
import { parseColorClass, TAILWIND_COLORS } from './lexicon.js';
import type { Config } from './rules.js';
import { getSuppressedLines, indexToLineCol } from './suppressions.js';

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

export function detectTypo(
  cls: string,
  extraColors: ReadonlySet<string> = new Set(),
): { suggestion: string } | null {
  const colon = cls.lastIndexOf(':');
  const prefix = colon === -1 ? '' : cls.slice(0, colon + 1);

  const parsed = parseColorClass(cls);
  if (!parsed) return null;
  const { property, color, shade } = parsed;

  if (TAILWIND_COLORS.has(color) || extraColors.has(color)) return null;

  const near = nearestColor(color);
  if (!near) return null;

  const suggestion = `${prefix}${property}-${near}${shade ? `-${shade}` : ''}`;
  return { suggestion };
}

export function analyzeTyposContent(
  filePath: string,
  content: string,
  config: Config = {},
): TypoFinding[] {
  const findings: TypoFinding[] = [];
  const suppressed = getSuppressedLines(content);
  const opts = toClassStringOpts(config);
  const extraColors = new Set(config.extraColors ?? []);

  for (const { value, start } of extractClassStrings(content, opts)) {
    for (const clsMatch of value.matchAll(SINGLE_CLASS_REGEX)) {
      const typo = detectTypo(clsMatch[0], extraColors);
      if (!typo) continue;
      const index = start + (clsMatch.index ?? 0);
      const { line, col } = indexToLineCol(content, index);
      if (suppressed.has(line)) continue;
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

export { analyzeTyposFile } from '../io/typos.js';
