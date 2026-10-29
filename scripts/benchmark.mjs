import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { analyzeConsistencyFiles } from '../dist/core/consistency.js';
import { dedupeContent } from '../dist/core/deduplicator.js';
import { fixContent } from '../dist/core/fixer.js';
import { sortContent } from '../dist/core/sorter.js';
import { analyzeFile, scanFiles } from '../dist/index.js';

const args = process.argv.slice(2);
function integerOption(name, fallback) {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  const value = Number(args[at + 1]);
  assert.ok(
    Number.isSafeInteger(value) && value > 0,
    `${name} must be a positive integer`,
  );
  return value;
}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') continue;
  assert.ok(
    ['--files', '--lines', '--runs'].includes(args[i]),
    `Unknown option: ${args[i]}`,
  );
  i++;
}
const fileCount = integerOption('--files', 90);
const linesPerFile = integerOption('--lines', 40);
const runs = integerOption('--runs', 5);
const config = { attributeNames: ['className', 'class'] };
const samples = [
  ['tsx', '<div className="text-[12px] p-[16px] rounded-[8px] flex flex" />'],
  ['vue', '<div class="text-[12px] p-[16px] rounded-[8px] flex flex" />'],
  [
    'svelte',
    '<section class="text-[12px] p-[16px] rounded-[8px] flex flex" />',
  ],
];
const dir = mkdtempSync(join(tmpdir(), 'tailwind-canonical-bench-'));
const corpus = Array.from({ length: fileCount }, (_, i) => {
  const [ext, line] = samples[i % samples.length];
  return {
    file: join(dir, `group-${i % 3}`, `component-${i}.${ext}`),
    content: Array.from({ length: linesPerFile }, () => line).join('\n'),
  };
});
function pipeline(content) {
  const fixed = fixContent(content, config).result;
  const deduped = dedupeContent(fixed, config).result;
  return sortContent(deduped, config).result;
}
function measure(name, operation) {
  operation(); // warm up the same corpus before measuring
  const times = Array.from({ length: runs }, () => {
    const started = performance.now();
    operation();
    return performance.now() - started;
  }).sort((a, b) => a - b);
  return {
    name,
    medianMs: Number(times[Math.floor(times.length / 2)].toFixed(3)),
    p95Ms: Number(times[Math.ceil(times.length * 0.95) - 1].toFixed(3)),
  };
}
try {
  for (const { file, content } of corpus) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  const files = scanFiles(dir);
  assert.equal(files.length, fileCount);
  const findings = files.flatMap((file) => analyzeFile(file, config));
  assert.equal(findings.length, fileCount * linesPerFile * 3);
  for (const { content } of corpus) {
    const result = pipeline(content);
    assert.equal(
      pipeline(result),
      result,
      'Transform pipeline must be idempotent',
    );
    assert.ok(
      !result.includes('['),
      'All fixture arbitrary values must be canonicalized',
    );
  }
  const result = {
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
    },
    corpus: {
      files: fileCount,
      lines: fileCount * linesPerFile,
      bytes: corpus.reduce(
        (sum, { content }) => sum + Buffer.byteLength(content),
        0,
      ),
      findings: findings.length,
      runs,
      warmupRuns: 1,
      seed: 'static-jsx-vue-svelte-v1',
    },
    stages: [
      measure('discovery', () => scanFiles(dir)),
      measure('file-analysis', () =>
        files.forEach((file) => {
          analyzeFile(file, config);
        }),
      ),
      measure('content-fix-dedup-sort', () =>
        corpus.forEach(({ content }) => {
          pipeline(content);
        }),
      ),
      measure('cross-file-consistency', () =>
        analyzeConsistencyFiles(files, config),
      ),
    ],
    heapUsedAfterBytes: process.memoryUsage().heapUsed,
  };
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(
      `${result.corpus.files} files / ${result.corpus.lines} lines / ${result.corpus.findings} findings, ${runs} measured runs after warmup (${process.version}, ${platform()} ${arch()})`,
    );
    for (const stage of result.stages)
      console.log(
        `${stage.name}: median ${stage.medianMs} ms, p95 ${stage.p95Ms} ms`,
      );
    console.log(
      'Synthetic corpus; compare runs on the same machine. No timing threshold is enforced.',
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
