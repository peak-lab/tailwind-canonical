import { watch as fsWatch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { analyzeFile, type Finding } from '../core/analyzer.js';
import type { ClassStringOpts } from '../core/class-strings.js';
import { loadConfig } from '../core/config.js';
import {
  analyzeConsistencyFiles,
  toConsistencyOptions,
} from '../core/consistency.js';
import { dedupeFile } from '../core/deduplicator.js';
import { fixFile } from '../core/fixer.js';
import { mergeFile } from '../core/merger.js';
import type { Config } from '../core/rules.js';
import { resolveTargets } from '../core/scanner.js';
import { sortFile } from '../core/sorter.js';
import { analyzeTyposFile, type TypoFinding } from '../core/typos.js';

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

const USAGE =
  'Usage: tailwind-canonical [--fix] [--merge] [--dedup] [--sort] [--analyze] [--typos] [--watch] [--reporter json|sarif] <dir|file> [dir|file...]';

export type Sink = {
  log: (s: string) => void;
  error: (s: string) => void;
  write: (s: string) => void;
};

export const defaultSink: Sink = {
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
  reporter: Reporter;
  targets: string[];
};

type FileCounts = {
  fixed: number;
  deduped: number;
  merged: number;
  sorted: number;
};

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

export function parseArgs(argv: string[]): Flags {
  const reporterIdx = argv.indexOf('--reporter');
  const reporterValue = argv[reporterIdx + 1];
  const reporter: Reporter =
    reporterIdx !== -1 &&
    (reporterValue === 'json' || reporterValue === 'sarif')
      ? reporterValue
      : 'text';

  const targets = argv.filter(
    (a, i) =>
      !a.startsWith('--') &&
      argv[i - 1] !== '--reporter' &&
      a !== 'json' &&
      a !== 'sarif',
  );

  return {
    fix: argv.includes('--fix'),
    merge: argv.includes('--merge'),
    dedup: argv.includes('--dedup'),
    sort: argv.includes('--sort'),
    watch: argv.includes('--watch'),
    analyze: argv.includes('--analyze'),
    typos: argv.includes('--typos'),
    reporter,
    targets,
  };
}

function runTypos(
  files: string[],
  config: Config,
  reporter: Reporter,
  sink: Sink,
): RunResult {
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

  if (reporter === 'json') {
    sink.write(
      `${JSON.stringify({ total: findings.length, typos: findings }, null, 2)}\n`,
    );
    return { exitCode: findings.length > 0 || hadError ? 1 : 0 };
  }

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
  return { exitCode: findings.length > 0 || hadError ? 1 : 0 };
}

function toClassStringOpts(config: Config): ClassStringOpts {
  return {
    functionNames: config.functionNames,
    attributeNames: config.attributeNames,
  };
}

async function processFile(
  file: string,
  flags: Flags,
  config: Config,
): Promise<FileCounts> {
  const opts = toClassStringOpts(config);
  const counts: FileCounts = { fixed: 0, deduped: 0, merged: 0, sorted: 0 };
  if (flags.fix) counts.fixed = fixFile(file, config);
  if (flags.dedup) counts.deduped = dedupeFile(file, opts);
  if (flags.merge) counts.merged = await mergeFile(file, opts);
  if (flags.sort) counts.sorted = sortFile(file, opts, config.sortOrder);
  return counts;
}

function totalOf(c: FileCounts): number {
  return c.fixed + c.deduped + c.merged + c.sorted;
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

  if (reporter === 'json') {
    sink.write(`${JSON.stringify(report, null, 2)}\n`);
    return { exitCode: issueCount > 0 || hadError ? 1 : 0 };
  }

  for (const group of report.colorVariants) {
    const tokens = group.variants
      .map((v) => `${group.property}-${v.token} (${v.count})`)
      .join(', ');
    sink.log(
      `  Warning: ${group.variants.length} ${group.family} color variants used for ${group.property}: ${tokens}`,
    );
  }
  for (const scale of report.scaleInconsistencies) {
    const values = scale.values
      .map(
        (v) =>
          `${scale.property}-${v.value} (${pluralize(v.files.length, 'file')})`,
      )
      .join(' vs ');
    sink.log(`  Warning: ${scale.property} inconsistency: ${values}`);
  }
  for (const combo of report.combinations) {
    sink.log(
      `  Pattern: "${combo.classes.join(' ')}" repeated in ${pluralize(combo.files.length, 'file')}`,
    );
  }
  if (issueCount === 0) {
    sink.log('✓ No cross-file inconsistencies found');
  } else {
    sink.log(
      `\n✖ Found ${pluralize(issueCount, 'consistency issue')} across ${pluralize(report.filesAnalyzed, 'file')}`,
    );
  }
  return { exitCode: issueCount > 0 || hadError ? 1 : 0 };
}

function startWatch(
  files: string[],
  flags: Flags,
  config: Config,
  sink: Sink,
): RunResult {
  const transforming = flags.fix || flags.dedup || flags.merge || flags.sort;
  const fileSet = new Set(files);
  const inFlight = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const dirs = new Set<string>(files.map((f) => dirname(f)));

  sink.log(`Watching ${pluralize(files.length, 'file')}... (Ctrl+C to stop)`);

  for (const dir of dirs) {
    fsWatch(dir, { recursive: true }, (_, filename) => {
      if (!filename) return;
      const full = resolve(dir, filename);
      if (!fileSet.has(full) || inFlight.has(full)) return;
      clearTimeout(timers.get(full));
      timers.set(
        full,
        setTimeout(() => {
          if (transforming) {
            inFlight.add(full);
            processFile(full, flags, config)
              .then((counts) => {
                const total = totalOf(counts);
                if (total > 0) {
                  sink.log(
                    `${timestamp()} ${full} — ${pluralize(total, 'change')} applied`,
                  );
                }
              })
              .catch((err: unknown) => {
                sink.error(
                  `${timestamp()} ${full} — error: ${err instanceof Error ? err.message : String(err)}`,
                );
              })
              .finally(() => inFlight.delete(full));
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

  process.on('SIGINT', () => {
    sink.log('\nWatcher stopped.');
    process.exit(0);
  });

  return { exitCode: 0, watching: true };
}

export async function run(
  argv: string[],
  cwd: string,
  sink: Sink = defaultSink,
): Promise<RunResult> {
  const flags = parseArgs(argv);

  if (flags.targets.length === 0) {
    sink.error(USAGE);
    return { exitCode: 1 };
  }

  if (flags.merge) {
    try {
      await import('tailwind-merge');
    } catch {
      sink.error('--merge requires tailwind-merge: pnpm add -D tailwind-merge');
      return { exitCode: 1 };
    }
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

  const files = await resolveTargets(flags.targets);

  if (flags.analyze) return runAnalyze(files, config, flags.reporter, sink);

  if (flags.typos) return runTypos(files, config, flags.reporter, sink);

  const transforming = flags.fix || flags.dedup || flags.merge || flags.sort;
  const totals: FileCounts = { fixed: 0, deduped: 0, merged: 0, sorted: 0 };
  const allFindings: Finding[] = [];
  const changedFiles: string[] = [];
  let hadError = false;

  if (!flags.watch) {
    for (const file of files) {
      try {
        if (transforming) {
          const counts = await processFile(file, flags, config);
          totals.fixed += counts.fixed;
          totals.deduped += counts.deduped;
          totals.merged += counts.merged;
          totals.sorted += counts.sorted;
          if (totalOf(counts) > 0) changedFiles.push(file);
          if (flags.reporter === 'text') {
            if (counts.fixed > 0)
              sink.log(
                `  fixed  ${file} (${pluralize(counts.fixed, 'replacement')})`,
              );
            if (counts.deduped > 0)
              sink.log(
                `  deduped ${file} (${pluralize(counts.deduped, 'class string')})`,
              );
            if (counts.merged > 0)
              sink.log(
                `  merged ${file} (${pluralize(counts.merged, 'conflict')})`,
              );
            if (counts.sorted > 0)
              sink.log(
                `  sorted ${file} (${pluralize(counts.sorted, 'class string')})`,
              );
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

  if (flags.watch) return startWatch(files, flags, config, sink);

  if (transforming) {
    if (flags.reporter === 'json') {
      sink.write(
        `${JSON.stringify(
          {
            files: files.length,
            changedFiles,
            fixed: totals.fixed,
            deduped: totals.deduped,
            merged: totals.merged,
            sorted: totals.sorted,
          },
          null,
          2,
        )}\n`,
      );
      return { exitCode: hadError ? 1 : 0 };
    }
    const parts: string[] = [];
    if (flags.fix) parts.push(pluralize(totals.fixed, 'replacement'));
    if (flags.dedup) parts.push(pluralize(totals.deduped, 'dedup'));
    if (flags.merge)
      parts.push(`${pluralize(totals.merged, 'conflict')} merged`);
    if (flags.sort) parts.push(`${totals.sorted} sorted`);
    sink.log(
      `\n✓ Fixed ${parts.join(', ')} across ${pluralize(files.length, 'file')}`,
    );
    return { exitCode: hadError ? 1 : 0 };
  }

  const totalFindings = allFindings.length;

  if (flags.reporter === 'json') {
    sink.write(
      `${JSON.stringify(
        {
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
        },
        null,
        2,
      )}\n`,
    );
    return { exitCode: totalFindings > 0 || hadError ? 1 : 0 };
  }

  if (flags.reporter === 'sarif') {
    const sarifOutput = {
      $schema: SARIF_SCHEMA,
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'tailwind-canonical',
              informationUri: 'https://github.com/peak-lab/tailwind-canonical',
              rules: [
                {
                  id: 'no-arbitrary-canonical',
                  name: 'NoArbitraryCanonical',
                  shortDescription: {
                    text: 'Arbitrary value has a canonical Tailwind equivalent',
                  },
                },
              ],
            },
          },
          results: allFindings.map((f) => ({
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
        },
      ],
    };
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
