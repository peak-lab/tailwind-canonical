#!/usr/bin/env node
import { analyzeFile } from '../core/analyzer.js';
import { fixFile } from '../core/fixer.js';
import type { Config } from '../core/rules.js';
import { scanFiles } from '../core/scanner.js';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const targets = args.filter((a) => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('Usage: tailwind-canonical [--fix] <dir|file> [dir|file...]');
  process.exit(1);
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

for (const file of files) {
  if (fix) {
    const count = fixFile(file, config);
    if (count > 0) {
      console.log(
        `  fixed  ${file} (${count} replacement${count > 1 ? 's' : ''})`,
      );
      totalFixed += count;
    }
  } else {
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

if (fix) {
  console.log(
    `\n✓ Fixed ${totalFixed} occurrence${totalFixed !== 1 ? 's' : ''} across ${files.length} files`,
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
