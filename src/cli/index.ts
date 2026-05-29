#!/usr/bin/env node
import { analyzeFile, type Finding } from '../core/analyzer.js';
import { dedupeFile } from '../core/deduplicator.js';
import { fixFile } from '../core/fixer.js';
import { mergeFile } from '../core/merger.js';
import type { Config } from '../core/rules.js';
import { scanFiles } from '../core/scanner.js';
import { sortFile } from '../core/sorter.js';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const merge = args.includes('--merge');
const dedup = args.includes('--dedup');
const sort = args.includes('--sort');

const reporterIdx = args.indexOf('--reporter');
const reporter: 'text' | 'json' | 'sarif' =
  reporterIdx !== -1 &&
  (args[reporterIdx + 1] === 'json' || args[reporterIdx + 1] === 'sarif')
    ? (args[reporterIdx + 1] as 'json' | 'sarif')
    : 'text';

const targets = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--reporter',
);

if (targets.length === 0) {
  console.error(
    'Usage: tailwind-canonical [--fix] [--merge] [--dedup] [--sort] [--reporter json|sarif] <dir|file> [dir|file...]',
  );
  process.exit(1);
}

if (merge) {
  try {
    await import('tailwind-merge');
  } catch {
    console.error(
      '--merge requires tailwind-merge: pnpm add -D tailwind-merge',
    );
    process.exit(1);
  }
}

let config: Config = {};
try {
  const { default: userConfig } = await import(
    new URL(`file://${process.cwd()}/tailwind-canonical.config.js`).href
  );
  config = userConfig;
} catch {}

const files = targets.flatMap((t) => scanFiles(t));
let totalFindings = 0;
let totalFixed = 0;
let totalMerged = 0;
let totalDeduped = 0;
let totalSorted = 0;
const allFindings: Finding[] = [];
const changedFiles: string[] = [];

for (const file of files) {
  if (fix) {
    const count = fixFile(file, config);
    if (count > 0) {
      totalFixed += count;
      changedFiles.push(file);
      if (reporter === 'text') {
        console.log(
          `  fixed  ${file} (${count} replacement${count > 1 ? 's' : ''})`,
        );
      }
    }
  }

  if (dedup) {
    const count = dedupeFile(file, { functionNames: config.functionNames });
    if (count > 0) {
      totalDeduped += count;
      if (!changedFiles.includes(file)) changedFiles.push(file);
      if (reporter === 'text') {
        console.log(
          `  deduped ${file} (${count} class string${count > 1 ? 's' : ''})`,
        );
      }
    }
  }

  if (merge) {
    const count = await mergeFile(file, {
      functionNames: config.functionNames,
    });
    if (count > 0) {
      totalMerged += count;
      if (!changedFiles.includes(file)) changedFiles.push(file);
      if (reporter === 'text') {
        console.log(
          `  merged ${file} (${count} conflict${count > 1 ? 's' : ''})`,
        );
      }
    }
  }

  if (sort) {
    const count = sortFile(file, { functionNames: config.functionNames });
    if (count > 0) {
      totalSorted += count;
      if (!changedFiles.includes(file)) changedFiles.push(file);
      if (reporter === 'text') {
        console.log(
          `  sorted ${file} (${count} class string${count > 1 ? 's' : ''})`,
        );
      }
    }
  }

  if (!fix && !dedup && !merge && !sort) {
    const findings = analyzeFile(file, config);
    allFindings.push(...findings);
    totalFindings += findings.length;
    if (reporter === 'text') {
      for (const f of findings) {
        const tag = f.suggestion.isCustomToken ? ' [custom token]' : '';
        console.log(
          `  ${f.file}:${f.line}:${f.col}  ${f.suggestion.original} → ${f.suggestion.canonical}${tag}`,
        );
      }
    }
  }
}

if (fix || dedup || merge || sort) {
  if (reporter === 'json') {
    process.stdout.write(
      JSON.stringify(
        {
          files: files.length,
          changedFiles,
          fixed: totalFixed,
          deduped: totalDeduped,
          merged: totalMerged,
          sorted: totalSorted,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    const parts: string[] = [];
    if (fix)
      parts.push(`${totalFixed} replacement${totalFixed !== 1 ? 's' : ''}`);
    if (dedup)
      parts.push(`${totalDeduped} dedup${totalDeduped !== 1 ? 's' : ''}`);
    if (merge)
      parts.push(
        `${totalMerged} conflict${totalMerged !== 1 ? 's' : ''} merged`,
      );
    if (sort) parts.push(`${totalSorted} sorted`);
    console.log(
      `\n✓ Fixed ${parts.join(', ')} across ${files.length} file${files.length !== 1 ? 's' : ''}`,
    );
  }
} else if (reporter === 'json') {
  process.stdout.write(
    JSON.stringify(
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
    ) + '\n',
  );
  if (totalFindings > 0) process.exit(1);
} else if (reporter === 'sarif') {
  const sarifOutput = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
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
  process.stdout.write(JSON.stringify(sarifOutput, null, 2) + '\n');
  if (totalFindings > 0) process.exit(1);
} else if (totalFindings > 0) {
  console.log(
    `\n✖ Found ${totalFindings} non-canonical class${totalFindings !== 1 ? 'es' : ''}`,
  );
  console.log('  Run with --fix to auto-replace\n');
  process.exit(1);
} else {
  console.log('✓ No non-canonical classes found');
}
