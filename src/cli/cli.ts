import {
  existsSync,
  watch as fsWatch,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { analyzeFile, type Finding } from '../core/analyzer.js';
import { toClassStringOpts } from '../core/class-strings.js';
import { CONFIG_FILENAMES, loadConfig } from '../core/config.js';
import {
  analyzeConsistencyFiles,
  type ConsistencyReport,
  toConsistencyOptions,
} from '../core/consistency.js';
import { dedupeContent } from '../core/deduplicator.js';
import { fixContent } from '../core/fixer.js';
import { mergeContent } from '../core/merger.js';
import type { Config } from '../core/rules.js';
import { resolveTargets } from '../core/scanner.js';
import { sortContent } from '../core/sorter.js';
import { analyzeTyposFile, type TypoFinding } from '../core/typos.js';

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

const USAGE =
  'Usage: tailwind-canonical [--fix] [--merge] [--dedup] [--sort] [--check] [--analyze] [--typos] [--watch] [--reporter json|sarif] <dir|file> [dir|file...]\n       tailwind-canonical init';

const INIT_CONFIG_CONTENT = [
  "import type { Config } from 'tailwind-canonical'",
  '',
  'export default {',
  '  // Run `tailwind-canonical` with no flags using these defaults:',
  "  // defaultCommand: { fix: true, dedup: true, sort: true, typos: true, targets: ['./src'] },",
  '  // px → token additions/overrides:',
  "  // customTextTokens: { 11: '2xs' },",
  "  // customSpacingTokens: { 14: '3.5' },",
  '  // Never suggest replacements for classes matching:',
  '  // ignorePatterns: [/^font-/],',
  '} satisfies Config',
  '',
].join('\n');

const HELP_TEXT = [
  USAGE,
  '',
  '  init               Create a tailwind-canonical.config.ts scaffold in the current directory',
  '  --fix              Auto-replace arbitrary values with canonical Tailwind classes',
  '  --dedup            Remove redundant classes and collapse shorthands',
  '  --merge            Resolve conflicting classes via tailwind-merge',
  '  --sort             Sort classes into canonical order',
  '  --check            Dry-run: report what transforms would change, write nothing (exit 1 on pending changes)',
  '  --analyze          Cross-file consistency analysis (read-only)',
  '  --typos            Flag likely misspelled color names (read-only)',
  '  --watch            Re-run on every file save (transform/check mode; ignored with --typos)',
  '  --reporter <type>  Output format: text|json|sarif',
  '  --help, -h         Show this help message',
  '  --version, -V      Show the installed version',
  '',
  'Mode precedence: --analyze runs alone (other modes ignored). --typos chains',
  'after transforms (fix → dedup → merge → sort → typo scan); alone it only scans.',
].join('\n');

export type Sink = {
  log: (s: string) => void;
  error: (s: string) => void;
  write: (s: string) => void;
};

const defaultSink: Sink = {
  log: (s) => console.log(s),
  error: (s) => console.error(s),
  write: (s) => process.stdout.write(s),
};

export type RunResult = { exitCode: number; watching?: boolean };

type Reporter = 'text' | 'json' | 'sarif';

type Flags = {
  fix: boolean;
  merge: boolean;
  dedup: boolean;
  sort: boolean;
  watch: boolean;
  analyze: boolean;
  typos: boolean;
  check: boolean;
  help: boolean;
  version: boolean;
  reporter: Reporter;
  targets: string[];
  error?: string;
  hasExplicitMode: boolean;
  hasExplicitReporter: boolean;
  hasExplicitWatch: boolean;
  hasExplicitCheck: boolean;
};

type FileCounts = {
  fixed: number;
  deduped: number;
  merged: number;
  sorted: number;
};

type JsonTyposReport = {
  total: number;
  typos: TypoFinding[];
};

type JsonTransformReport = {
  files: number;
  changedFiles: string[];
  fixed: number;
  deduped: number;
  merged: number;
  sorted: number;
  typoTotal?: number;
  typos?: TypoFinding[];
  check?: boolean;
};

type JsonFinding = {
  file: string;
  line: number;
  col: number;
  original: string;
  canonical: string;
  isCustomToken: boolean;
};

type JsonFindingsReport = {
  files: number;
  total: number;
  findings: JsonFinding[];
};

type SarifReport = {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        informationUri: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region: { startLine: number; startColumn: number };
        };
      }>;
    }>;
  }>;
};

type SarifRule = SarifReport['runs'][0]['tool']['driver']['rules'][0];
type SarifResult = SarifReport['runs'][0]['results'][0];

const KNOWN_CLASS_FUNCTIONS = ['cn', 'clsx', 'cva'] as const;
const DEFAULT_ANALYZE_TEXT_OPTIONS = {
  maxScaleGroups: 8,
  maxScaleValues: 5,
  maxRareValues: 12,
  maxPatterns: 10,
};

function sarifDocument(
  rules: SarifRule[],
  results: SarifResult[],
): SarifReport {
  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'tailwind-canonical',
            informationUri: 'https://github.com/peak-lab/tailwind-canonical',
            rules,
          },
        },
        results,
      },
    ],
  };
}

function fileLocations(files: string[]): SarifResult['locations'] {
  return files.map((uri) => ({
    physicalLocation: {
      artifactLocation: { uri },
      region: { startLine: 1, startColumn: 1 },
    },
  }));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

const REPORTERS: readonly Reporter[] = ['text', 'json', 'sarif'];
const MODE_FLAGS = [
  '--fix',
  '--merge',
  '--dedup',
  '--sort',
  '--analyze',
  '--typos',
] as const;

const KNOWN_FLAGS = new Set([
  '--fix',
  '--merge',
  '--dedup',
  '--sort',
  '--check',
  '--watch',
  '--analyze',
  '--typos',
  '--reporter',
  '--help',
  '--version',
]);

function isReporter(value: string): value is Reporter {
  return (REPORTERS as readonly string[]).includes(value);
}

export function parseArgs(argv: string[]): Flags {
  let reporter: Reporter = 'text';
  let reporterRaw: string | undefined;
  let reporterDangling = false;
  const consumed = new Set<number>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reporter') {
      consumed.add(i);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        reporterRaw = argv[i + 1];
        consumed.add(i + 1);
      } else {
        reporterDangling = true;
      }
    } else if (arg.startsWith('--reporter=')) {
      consumed.add(i);
      reporterRaw = arg.slice('--reporter='.length);
    } else if (arg === '-h' || arg === '-V') {
      consumed.add(i);
    }
  }

  let error: string | undefined;
  if (reporterDangling) {
    error = 'Missing value for --reporter (expected text|json|sarif)';
  } else if (reporterRaw !== undefined) {
    if (isReporter(reporterRaw)) {
      reporter = reporterRaw;
    } else {
      error = `Unknown reporter: ${reporterRaw} (expected ${REPORTERS.join('|')})`;
    }
  }

  if (!error) {
    const unknown = argv.find(
      (a, i) =>
        a.startsWith('--') &&
        !consumed.has(i) &&
        !KNOWN_FLAGS.has(a) &&
        !a.startsWith('--reporter='),
    );
    if (unknown) error = `Unknown flag: ${unknown}`;
  }

  const targets = argv.filter(
    (a, i) => !(a.startsWith('--') || consumed.has(i)),
  );

  return {
    fix: argv.includes('--fix'),
    merge: argv.includes('--merge'),
    dedup: argv.includes('--dedup'),
    sort: argv.includes('--sort'),
    watch: argv.includes('--watch'),
    analyze: argv.includes('--analyze'),
    typos: argv.includes('--typos'),
    check: argv.includes('--check'),
    help: argv.includes('--help') || argv.includes('-h'),
    version: argv.includes('--version') || argv.includes('-V'),
    reporter,
    targets,
    error,
    hasExplicitMode: MODE_FLAGS.some((flag) => argv.includes(flag)),
    hasExplicitReporter: reporterRaw !== undefined,
    hasExplicitWatch: argv.includes('--watch'),
    hasExplicitCheck: argv.includes('--check'),
  };
}

/** Explicit CLI flags win; otherwise `defaultCommand` fills the gap. */
function fallback<T>(explicit: boolean, flag: T, configured: T | undefined): T {
  return explicit ? flag : (configured ?? flag);
}

function applyDefaultCommand(flags: Flags, config: Config): Flags {
  const defaults = config.defaultCommand;
  if (!defaults) return flags;

  const mode = flags.hasExplicitMode;
  return {
    ...flags,
    fix: fallback(mode, flags.fix, defaults.fix),
    merge: fallback(mode, flags.merge, defaults.merge),
    dedup: fallback(mode, flags.dedup, defaults.dedup),
    sort: fallback(mode, flags.sort, defaults.sort),
    analyze: fallback(mode, flags.analyze, defaults.analyze),
    typos: fallback(mode, flags.typos, defaults.typos),
    watch: fallback(flags.hasExplicitWatch, flags.watch, defaults.watch),
    check: fallback(flags.hasExplicitCheck, flags.check, defaults.check),
    reporter: fallback(
      flags.hasExplicitReporter,
      flags.reporter,
      defaults.reporter,
    ),
    targets:
      flags.targets.length > 0 ? flags.targets : (defaults.targets ?? []),
  };
}

function resolveTarget(cwd: string, target: string): string {
  if (target.startsWith('!')) return `!${resolve(cwd, target.slice(1))}`;
  return resolve(cwd, target);
}

const TRANSFORM_FLAGS: ReadonlyArray<{ key: keyof Flags; flag: string }> = [
  { key: 'fix', flag: '--fix' },
  { key: 'dedup', flag: '--dedup' },
  { key: 'merge', flag: '--merge' },
  { key: 'sort', flag: '--sort' },
];

/**
 * `--analyze` is exclusive: it suppresses transforms, `--typos`, and
 * `--watch`. `--typos` chains after transforms (fix → dedup → merge → sort →
 * typo scan) but does not support `--watch`. This computes warnings for every
 * flag the active mode will ignore. Pure and order-stable so it can be
 * unit-tested via the injectable sink.
 */
export function flagWarnings(flags: Flags): string[] {
  const warnings: string[] = [];

  if (flags.analyze) {
    for (const { key, flag } of TRANSFORM_FLAGS) {
      if (flags[key])
        warnings.push(`${flag} ignored: --analyze takes priority`);
    }
    if (flags.typos) warnings.push('--typos ignored: --analyze takes priority');
    if (flags.check) warnings.push('--check ignored: --analyze takes priority');
    if (flags.watch)
      warnings.push('--watch ignored: not supported with --analyze');
    return warnings;
  }

  if (flags.watch && (flags.typos || flags.check)) {
    const unsupported: string[] = [];
    if (flags.typos) unsupported.push('--typos');
    if (flags.check) unsupported.push('--check');
    warnings.push(
      `--watch ignored: not supported with ${unsupported.join('/')}`,
    );
  }

  return warnings;
}

function collectTypos(
  files: string[],
  config: Config,
  sink: Sink,
): { findings: TypoFinding[]; hadError: boolean } {
  let hadError = false;
  const findings: TypoFinding[] = [];
  for (const file of files) {
    try {
      findings.push(...analyzeTyposFile(file, config));
    } catch (err) {
      hadError = true;
      sink.error(`${file}: ${errMsg(err)}`);
    }
  }
  return { findings, hadError };
}

function logTyposText(findings: TypoFinding[], sink: Sink): void {
  for (const f of findings) {
    sink.log(
      `  ${f.file}:${f.line}:${f.col}  ${f.original} → ${f.suggestion} [typo]`,
    );
  }
  if (findings.length === 0) {
    sink.log('✓ No likely typos found');
  } else {
    sink.log(`\n✖ Found ${pluralize(findings.length, 'likely typo')}`);
  }
}

function typoSarifDocument(findings: TypoFinding[]): SarifReport {
  return sarifDocument(
    [
      {
        id: 'color-typo',
        name: 'ColorTypo',
        shortDescription: {
          text: 'Class color name is a likely typo of a Tailwind color',
        },
      },
    ],
    findings.map((f) => ({
      ruleId: 'color-typo',
      message: { text: `${f.original} → ${f.suggestion}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: f.file },
            region: { startLine: f.line, startColumn: f.col },
          },
        },
      ],
    })),
  );
}

function runTypos(
  files: string[],
  config: Config,
  reporter: Reporter,
  sink: Sink,
): RunResult {
  const { findings, hadError } = collectTypos(files, config, sink);

  if (reporter === 'json') {
    const report: JsonTyposReport = {
      total: findings.length,
      typos: findings,
    };
    sink.write(`${JSON.stringify(report, null, 2)}\n`);
    return { exitCode: findings.length > 0 || hadError ? 1 : 0 };
  }

  if (reporter === 'sarif') {
    sink.write(`${JSON.stringify(typoSarifDocument(findings), null, 2)}\n`);
    return { exitCode: findings.length > 0 || hadError ? 1 : 0 };
  }

  logTyposText(findings, sink);
  return { exitCode: findings.length > 0 || hadError ? 1 : 0 };
}

function applyTransforms(
  content: string,
  flags: Flags,
  config: Config,
  twMerge?: (classes: string) => string,
): { counts: FileCounts; result: string } {
  const opts = toClassStringOpts(config);
  const counts: FileCounts = { fixed: 0, deduped: 0, merged: 0, sorted: 0 };
  let result = content;

  if (flags.fix) {
    const fixed = fixContent(result, config);
    counts.fixed = fixed.count;
    result = fixed.result;
  }
  if (flags.dedup) {
    const deduped = dedupeContent(result, opts);
    counts.deduped = deduped.count;
    result = deduped.result;
  }
  if (flags.merge) {
    if (!twMerge) {
      throw new Error(
        'merge requires the optional peer dependency "tailwind-merge"',
      );
    }
    const merged = mergeContent(result, twMerge, opts);
    counts.merged = merged.count;
    result = merged.result;
  }
  if (flags.sort) {
    const sorted = sortContent(result, opts, config.sortOrder);
    counts.sorted = sorted.count;
    result = sorted.result;
  }

  return { counts, result };
}

function processFile(
  file: string,
  flags: Flags,
  config: Config,
  twMerge?: (classes: string) => string,
): FileCounts {
  const content = readFileSync(file, 'utf8');
  const { counts, result } = applyTransforms(content, flags, config, twMerge);
  // Counts, not text equality: replaceClassStrings also normalizes attribute
  // spacing, which no transform counts. Writing on any textual difference
  // would rewrite files that --check truthfully reports as clean.
  if (totalOf(counts) > 0) writeFileSync(file, result, 'utf8');
  return counts;
}

const TRANSFORM_LABELS: ReadonlyArray<{
  key: keyof FileCounts;
  applied: string;
  pending: string;
  unit: string;
}> = [
  {
    key: 'fixed',
    applied: 'fixed ',
    pending: 'would fix',
    unit: 'replacement',
  },
  {
    key: 'deduped',
    applied: 'deduped',
    pending: 'would dedup',
    unit: 'class string',
  },
  {
    key: 'merged',
    applied: 'merged ',
    pending: 'would merge',
    unit: 'conflict',
  },
  {
    key: 'sorted',
    applied: 'sorted ',
    pending: 'would sort',
    unit: 'class string',
  },
];

function logTransformCounts(
  counts: FileCounts,
  file: string,
  check: boolean,
  sink: Sink,
): void {
  for (const { key, applied, pending, unit } of TRANSFORM_LABELS) {
    const count = counts[key];
    if (count > 0) {
      sink.log(
        `  ${check ? pending : applied} ${file} (${pluralize(count, unit)})`,
      );
    }
  }
}

function totalOf(c: FileCounts): number {
  return c.fixed + c.deduped + c.merged + c.sorted;
}

function scaleClass(property: string, value: string): string {
  return value.startsWith('-')
    ? `-${property}-${value.slice(1)}`
    : `${property}-${value}`;
}

function findUnconfiguredClassFunctions(
  files: string[],
  config: Config,
): string[] {
  const configured = new Set(config.functionNames ?? []);
  const missing = KNOWN_CLASS_FUNCTIONS.filter((name) => !configured.has(name));
  if (missing.length === 0) return [];

  const found = new Set<string>();
  const re = new RegExp(`\\b(${missing.join('|')})\\s*\\(`);
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const match = content.match(re);
    if (match?.[1]) found.add(match[1]);
  }

  return [...found].sort();
}

function compactPath(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length <= 4) return normalized;
  return `.../${parts.slice(-4).join('/')}`;
}

function withMore<T>(
  values: T[],
  limit: number,
  format: (value: T) => string,
): string {
  const shown = values.slice(0, limit).map(format);
  const remaining = values.length - shown.length;
  if (remaining > 0) shown.push(`+${remaining} more`);
  return shown.join(', ');
}

function scaleValueSummary(
  property: string,
  value: { value: string; count: number; files: string[] },
): string {
  return `${scaleClass(property, value.value)} (${pluralize(value.count, 'use')}, ${pluralize(value.files.length, 'file')})`;
}

function scaleTotalUses(
  scale: ConsistencyReport['scaleInconsistencies'][number],
): number {
  return scale.values.reduce((sum, value) => sum + value.count, 0);
}

function logAnalyzeText(
  report: ConsistencyReport,
  issueCount: number,
  config: Config,
  sink: Sink,
): void {
  const textOptions = {
    maxScaleGroups:
      config.analyze?.maxScaleGroups ??
      DEFAULT_ANALYZE_TEXT_OPTIONS.maxScaleGroups,
    maxScaleValues:
      config.analyze?.maxScaleValues ??
      DEFAULT_ANALYZE_TEXT_OPTIONS.maxScaleValues,
    maxRareValues:
      config.analyze?.maxRareValues ??
      DEFAULT_ANALYZE_TEXT_OPTIONS.maxRareValues,
    maxPatterns:
      config.analyze?.maxPatterns ?? DEFAULT_ANALYZE_TEXT_OPTIONS.maxPatterns,
  };

  sink.log('tailwind-canonical analyze');
  sink.log(`Files analyzed: ${report.filesAnalyzed}`);
  sink.log(
    `Issue groups: ${issueCount} (${pluralize(report.colorVariants.length, 'color')}, ${pluralize(report.scaleInconsistencies.length, 'scale')}, ${pluralize(report.combinations.length, 'pattern')})`,
  );
  if (report.rareScaleValues.length > 0) {
    sink.log(`Rare values: ${report.rareScaleValues.length}`);
  }

  if (issueCount === 0) {
    sink.log('\nNo cross-file inconsistencies found');
    return;
  }

  if (report.colorVariants.length > 0) {
    sink.log('\nColor variants');
    for (const group of report.colorVariants) {
      const tokens = group.variants
        .map((v) => `${group.property}-${v.token} x${v.count}`)
        .join(', ');
      sink.log(`  - ${group.property}/${group.family}: ${tokens}`);
    }
  }

  if (report.scaleInconsistencies.length > 0) {
    sink.log('\nScale inconsistency groups');
    const scales = [...report.scaleInconsistencies].sort(
      (a, b) =>
        scaleTotalUses(b) - scaleTotalUses(a) ||
        a.property.localeCompare(b.property),
    );
    for (const scale of scales.slice(0, textOptions.maxScaleGroups)) {
      const totalUses = scaleTotalUses(scale);
      const files = new Set(scale.values.flatMap((value) => value.files));
      sink.log(
        `  - ${scale.property}: ${scale.values.length} values, ${totalUses} uses, ${pluralize(files.size, 'file')}`,
      );
      sink.log(
        `    Top: ${withMore(scale.values, textOptions.maxScaleValues, (value) => scaleValueSummary(scale.property, value))}`,
      );
    }
    const remaining = scales.length - textOptions.maxScaleGroups;
    if (remaining > 0) sink.log(`  - +${remaining} more scale groups`);
  }

  if (report.rareScaleValues.length > 0) {
    sink.log('\nRare scale values');
    for (const rare of report.rareScaleValues.slice(
      0,
      textOptions.maxRareValues,
    )) {
      const example = rare.files[0]
        ? `; e.g. ${compactPath(rare.files[0])}`
        : '';
      sink.log(
        `  - ${rare.className}: ${pluralize(rare.count, 'use')} in ${pluralize(rare.files.length, 'file')} (${rare.propertyCount} ${rare.property} uses total)${example}`,
      );
    }
    const remaining = report.rareScaleValues.length - textOptions.maxRareValues;
    if (remaining > 0) sink.log(`  - +${remaining} more rare values`);
  }

  if (report.combinations.length > 0) {
    sink.log('\nRepeated patterns');
    for (const combo of report.combinations.slice(0, textOptions.maxPatterns)) {
      sink.log(
        `  - Pattern: "${combo.classes.join(' ')}" repeated in ${pluralize(combo.files.length, 'file')}`,
      );
    }
    const remaining = report.combinations.length - textOptions.maxPatterns;
    if (remaining > 0) sink.log(`  - +${remaining} more repeated patterns`);
  }

  sink.log(
    `\nFound ${pluralize(issueCount, 'consistency issue')} across ${pluralize(report.filesAnalyzed, 'file')}`,
  );
}

function runAnalyze(
  files: string[],
  config: Config,
  reporter: Reporter,
  sink: Sink,
): RunResult {
  let hadError = false;
  const options = toConsistencyOptions(config);
  const report = analyzeConsistencyFiles(
    files,
    config,
    options,
    (file, err) => {
      hadError = true;
      sink.error(`${file}: ${errMsg(err)}`);
    },
  );
  const issueCount =
    report.colorVariants.length +
    report.scaleInconsistencies.length +
    report.combinations.length;
  const unconfiguredFunctions = findUnconfiguredClassFunctions(files, config);
  if (unconfiguredFunctions.length > 0) {
    const calls = unconfiguredFunctions
      .map((name) => `${name}(...)`)
      .join(', ');
    sink.error(
      `Warning: detected ${calls} calls but functionNames does not include them; --analyze may miss class strings.`,
    );
  }

  if (reporter === 'json') {
    sink.write(`${JSON.stringify(report, null, 2)}\n`);
    return { exitCode: issueCount > 0 || hadError ? 1 : 0 };
  }

  if (reporter === 'sarif') {
    const results: SarifResult[] = [];
    for (const group of report.colorVariants) {
      const tokens = group.variants.map((v) => v.token).join(', ');
      const files = [...new Set(group.variants.flatMap((v) => v.files))];
      results.push({
        ruleId: 'color-variant-inconsistency',
        message: {
          text: `${group.variants.length} ${group.family} color variants for ${group.property}: ${tokens}`,
        },
        locations: fileLocations(files),
      });
    }
    for (const scale of report.scaleInconsistencies) {
      const values = scale.values
        .map((v) => scaleClass(scale.property, v.value))
        .join(' vs ');
      const files = [...new Set(scale.values.flatMap((v) => v.files))];
      results.push({
        ruleId: 'scale-inconsistency',
        message: { text: `${scale.property} inconsistency: ${values}` },
        locations: fileLocations(files),
      });
    }
    for (const rare of report.rareScaleValues) {
      results.push({
        ruleId: 'rare-scale-value',
        message: {
          text: `${rare.className} is rare for ${rare.property}: ${rare.count} occurrence(s) in ${rare.files.length} file(s), within ${rare.propertyCount} ${rare.property} uses`,
        },
        locations: fileLocations(rare.files),
      });
    }
    for (const combo of report.combinations) {
      results.push({
        ruleId: 'repeated-combination',
        message: {
          text: `Repeated class combination: ${combo.classes.join(' ')}`,
        },
        locations: fileLocations(combo.files),
      });
    }
    const sarifOutput = sarifDocument(
      [
        {
          id: 'color-variant-inconsistency',
          name: 'ColorVariantInconsistency',
          shortDescription: {
            text: 'Multiple color variants of the same family used for one property',
          },
        },
        {
          id: 'scale-inconsistency',
          name: 'ScaleInconsistency',
          shortDescription: {
            text: 'Inconsistent scale values used for the same property',
          },
        },
        {
          id: 'rare-scale-value',
          name: 'RareScaleValue',
          shortDescription: {
            text: 'A scale value appears rarely within an otherwise common property',
          },
        },
        {
          id: 'repeated-combination',
          name: 'RepeatedCombination',
          shortDescription: {
            text: 'Identical class combination repeated across files',
          },
        },
      ],
      results,
    );
    sink.write(`${JSON.stringify(sarifOutput, null, 2)}\n`);
    return { exitCode: issueCount > 0 || hadError ? 1 : 0 };
  }

  logAnalyzeText(report, issueCount, config, sink);
  return { exitCode: issueCount > 0 || hadError ? 1 : 0 };
}

function startWatch(
  files: string[],
  flags: Flags,
  config: Config,
  twMerge: ((classes: string) => string) | undefined,
  sink: Sink,
): RunResult {
  const transforming = flags.fix || flags.dedup || flags.merge || flags.sort;
  const fileSet = new Set(files);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const dirs = new Set<string>(files.map((f) => dirname(f)));

  sink.log(`Watching ${pluralize(files.length, 'file')}... (Ctrl+C to stop)`);

  for (const dir of dirs) {
    fsWatch(dir, { recursive: true }, (_, filename) => {
      if (!filename) return;
      const full = resolve(dir, filename);
      if (!fileSet.has(full)) return;
      clearTimeout(timers.get(full));
      timers.set(
        full,
        setTimeout(() => {
          if (transforming) {
            try {
              const total = totalOf(processFile(full, flags, config, twMerge));
              if (total > 0) {
                sink.log(
                  `${timestamp()} ${full} — ${pluralize(total, 'change')} applied`,
                );
              }
            } catch (err) {
              sink.error(`${timestamp()} ${full} — error: ${errMsg(err)}`);
            }
          } else {
            const findings = analyzeFile(full, config);
            if (findings.length > 0) {
              sink.log(
                `${timestamp()} ${full} — ${pluralize(findings.length, 'finding')}`,
              );
              for (const f of findings) {
                const tag = f.suggestion.isCustomToken ? ' [custom token]' : '';
                sink.log(
                  `  ${f.line}:${f.col}  ${f.suggestion.original} → ${f.suggestion.canonical}${tag}`,
                );
              }
            }
          }
        }, 50),
      );
    });
  }

  process.once('SIGINT', () => {
    sink.log('\nWatcher stopped.');
    process.exit(0);
  });

  return { exitCode: 0, watching: true };
}

function runInit(cwd: string, sink: Sink): RunResult {
  const existing = CONFIG_FILENAMES.find((name) => existsSync(join(cwd, name)));
  if (existing) {
    sink.error(`${existing} already exists`);
    return { exitCode: 1 };
  }

  const filename = CONFIG_FILENAMES[0];
  writeFileSync(join(cwd, filename), INIT_CONFIG_CONTENT, 'utf8');
  sink.log(`Created ${filename}`);
  sink.log('Uncomment defaultCommand to set your CLI defaults.');
  sink.log('Then run `npx tailwind-canonical` to lint your project.');
  return { exitCode: 0 };
}

export async function run(
  argv: string[],
  cwd: string,
  sink: Sink = defaultSink,
): Promise<RunResult> {
  let flags = parseArgs(argv);

  if (flags.help) {
    sink.log(HELP_TEXT);
    return { exitCode: 0 };
  }

  if (flags.version) {
    try {
      const pkg = JSON.parse(
        readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
      ) as { version: string };
      sink.log(pkg.version);
      return { exitCode: 0 };
    } catch (err) {
      sink.error(`tailwind-canonical: could not read version: ${errMsg(err)}`);
      return { exitCode: 1 };
    }
  }

  if (flags.targets[0] === 'init') {
    if (
      flags.error ||
      flags.hasExplicitMode ||
      flags.hasExplicitWatch ||
      flags.hasExplicitCheck ||
      flags.hasExplicitReporter
    ) {
      sink.error('init takes no flags');
      return { exitCode: 1 };
    }
    if (flags.targets.length > 1) {
      sink.error('init takes no extra arguments');
      return { exitCode: 1 };
    }
    return runInit(cwd, sink);
  }

  if (flags.error) {
    sink.error(flags.error);
    return { exitCode: 1 };
  }

  let config: Config;
  try {
    config = await loadConfig(cwd);
  } catch (err) {
    sink.error(
      `tailwind-canonical: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { exitCode: 1 };
  }

  flags = applyDefaultCommand(flags, config);

  if (flags.targets.length === 0) {
    sink.error(USAGE);
    return { exitCode: 1 };
  }

  if (
    flags.check &&
    !flags.analyze &&
    !flags.fix &&
    !flags.dedup &&
    !flags.merge &&
    !flags.sort
  ) {
    sink.error(
      '--check requires at least one of --fix, --dedup, --merge, --sort',
    );
    return { exitCode: 1 };
  }

  let twMerge: ((classes: string) => string) | undefined;
  if (flags.merge && !flags.analyze) {
    try {
      ({ twMerge } = await import('tailwind-merge'));
    } catch {
      sink.error('--merge requires tailwind-merge: pnpm add -D tailwind-merge');
      return { exitCode: 1 };
    }
  }

  for (const warning of flagWarnings(flags)) {
    sink.error(`Warning: ${warning}`);
  }

  const targetPaths = flags.targets.map((target) => resolveTarget(cwd, target));
  const files = await resolveTargets(targetPaths);

  if (files.length === 0) {
    sink.error(`No files matched: ${flags.targets.join(' ')}`);
    return { exitCode: 1 };
  }

  if (flags.analyze) return runAnalyze(files, config, flags.reporter, sink);

  const transforming = flags.fix || flags.dedup || flags.merge || flags.sort;

  if (flags.typos && !transforming) {
    return runTypos(files, config, flags.reporter, sink);
  }

  const watching = flags.watch && !flags.typos && !flags.check;
  const totals: FileCounts = { fixed: 0, deduped: 0, merged: 0, sorted: 0 };
  const allFindings: Finding[] = [];
  const changedFiles: string[] = [];
  let hadError = false;

  if (!watching) {
    for (const file of files) {
      try {
        if (transforming) {
          const counts = flags.check
            ? applyTransforms(
                readFileSync(file, 'utf8'),
                flags,
                config,
                twMerge,
              ).counts
            : processFile(file, flags, config, twMerge);
          totals.fixed += counts.fixed;
          totals.deduped += counts.deduped;
          totals.merged += counts.merged;
          totals.sorted += counts.sorted;
          if (totalOf(counts) > 0) changedFiles.push(file);
          if (flags.reporter === 'text') {
            logTransformCounts(counts, file, flags.check, sink);
          }
        } else {
          const findings = analyzeFile(file, config);
          allFindings.push(...findings);
          if (flags.reporter === 'text') {
            for (const f of findings) {
              const tag = f.suggestion.isCustomToken ? ' [custom token]' : '';
              sink.log(
                `  ${f.file}:${f.line}:${f.col}  ${f.suggestion.original} → ${f.suggestion.canonical}${tag}`,
              );
            }
          }
        }
      } catch (err) {
        hadError = true;
        sink.error(`${file}: ${errMsg(err)}`);
      }
    }
  }

  if (watching) return startWatch(files, flags, config, twMerge, sink);

  if (transforming) {
    const typoResult = flags.typos
      ? collectTypos(files, config, sink)
      : undefined;
    const totalChanges = totalOf(totals);
    const exitCode =
      hadError ||
      (flags.check && totalChanges > 0) ||
      (typoResult && (typoResult.findings.length > 0 || typoResult.hadError))
        ? 1
        : 0;

    if (flags.reporter === 'json') {
      const report: JsonTransformReport = {
        files: files.length,
        changedFiles,
        fixed: totals.fixed,
        deduped: totals.deduped,
        merged: totals.merged,
        sorted: totals.sorted,
      };
      if (flags.check) report.check = true;
      if (typoResult) {
        report.typoTotal = typoResult.findings.length;
        report.typos = typoResult.findings;
      }
      sink.write(`${JSON.stringify(report, null, 2)}\n`);
      return { exitCode };
    }

    if (flags.reporter === 'sarif') {
      const doc = typoResult
        ? typoSarifDocument(typoResult.findings)
        : sarifDocument([], []);
      sink.write(`${JSON.stringify(doc, null, 2)}\n`);
      return { exitCode };
    }

    if (flags.check) {
      if (totalChanges > 0) {
        sink.log(
          `\n✖ ${pluralize(totalChanges, 'pending change')} across ${pluralize(changedFiles.length, 'file')} (run without --check to apply)`,
        );
      } else {
        sink.log('✓ No pending changes');
      }
    } else {
      const parts: string[] = [];
      if (flags.fix) parts.push(pluralize(totals.fixed, 'replacement'));
      if (flags.dedup) parts.push(pluralize(totals.deduped, 'dedup'));
      if (flags.merge)
        parts.push(`${pluralize(totals.merged, 'conflict')} merged`);
      if (flags.sort) parts.push(`${totals.sorted} sorted`);
      sink.log(
        `\n✓ Fixed ${parts.join(', ')} across ${pluralize(files.length, 'file')}`,
      );
    }
    if (typoResult) logTyposText(typoResult.findings, sink);
    return { exitCode };
  }

  const totalFindings = allFindings.length;

  if (flags.reporter === 'json') {
    const report: JsonFindingsReport = {
      files: files.length,
      total: totalFindings,
      findings: allFindings.map((f) => ({
        file: f.file,
        line: f.line,
        col: f.col,
        original: f.suggestion.original,
        canonical: f.suggestion.canonical,
        isCustomToken: f.suggestion.isCustomToken,
      })),
    };
    sink.write(`${JSON.stringify(report, null, 2)}\n`);
    return { exitCode: totalFindings > 0 || hadError ? 1 : 0 };
  }

  if (flags.reporter === 'sarif') {
    const sarifOutput = sarifDocument(
      [
        {
          id: 'no-arbitrary-canonical',
          name: 'NoArbitraryCanonical',
          shortDescription: {
            text: 'Arbitrary value has a canonical Tailwind equivalent',
          },
        },
      ],
      allFindings.map((f) => ({
        ruleId: 'no-arbitrary-canonical',
        message: {
          text: `${f.suggestion.original} → ${f.suggestion.canonical}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: f.file },
              region: { startLine: f.line, startColumn: f.col },
            },
          },
        ],
      })),
    );
    sink.write(`${JSON.stringify(sarifOutput, null, 2)}\n`);
    return { exitCode: totalFindings > 0 || hadError ? 1 : 0 };
  }

  if (totalFindings > 0) {
    sink.log(
      `\n✖ Found ${totalFindings} non-canonical class${totalFindings !== 1 ? 'es' : ''}`,
    );
    sink.log('  Run with --fix to auto-replace\n');
    return { exitCode: 1 };
  }

  sink.log('✓ No non-canonical classes found');
  return { exitCode: hadError ? 1 : 0 };
}
