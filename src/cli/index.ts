#!/usr/bin/env node
import { analyzeFile } from '../core/analyzer.js';
import { dedupeFile } from '../core/deduplicator.js';
import { fixFile } from '../core/fixer.js';
import { mergeFile } from '../core/merger.js';
import type { Config } from '../core/rules.js';
import { scanFiles } from '../core/scanner.js';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const merge = args.includes('--merge');
const dedup = args.includes('--dedup');
const targets = args.filter((a) => !a.startsWith('--'));

if (targets.length === 0) {
  console.error(
    'Usage: tailwind-canonical [--fix] [--merge] [--dedup] <dir|file> [dir|file...]',
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

for (const file of files) {
  if (fix) {
    const count = fixFile(file, config);
    if (count > 0) {
      console.log(
        `  fixed  ${file} (${count} replacement${count > 1 ? 's' : ''})`,
      );
      totalFixed += count;
    }
  }

  if (dedup) {
    const count = dedupeFile(file);
    if (count > 0) {
      console.log(
        `  deduped ${file} (${count} class string${count > 1 ? 's' : ''})`,
      );
      totalDeduped += count;
    }
  }

  if (merge) {
    const count = await mergeFile(file);
    if (count > 0) {
      console.log(
        `  merged ${file} (${count} conflict${count > 1 ? 's' : ''})`,
      );
      totalMerged += count;
    }
  }

  if (!fix && !dedup && !merge) {
    const findings = analyzeFile(file, config);
    for (const f of findings) {
      const tag = f.suggestion.isCustomToken ? ' [custom token]' : '';
      console.log(
        `  ${f.file}:${f.line}:${f.col}  ${f.suggestion.original} → ${f.suggestion.canonical}${tag}`,
      );
    }
    totalFindings += findings.length;
  }
}

if (fix || dedup || merge) {
  const parts: string[] = [];
  if (fix)
    parts.push(`${totalFixed} replacement${totalFixed !== 1 ? 's' : ''}`);
  if (dedup)
    parts.push(`${totalDeduped} dedup${totalDeduped !== 1 ? 's' : ''}`);
  if (merge)
    parts.push(`${totalMerged} conflict${totalMerged !== 1 ? 's' : ''} merged`);
  console.log(
    `\n✓ Fixed ${parts.join(', ')} across ${files.length} file${files.length !== 1 ? 's' : ''}`,
  );
} else if (totalFindings > 0) {
  console.log(
    `\n✖ Found ${totalFindings} non-canonical class${totalFindings !== 1 ? 'es' : ''}`,
  );
  console.log('  Run with --fix to auto-replace\n');
  process.exit(1);
} else {
  console.log('✓ No non-canonical classes found');
}
