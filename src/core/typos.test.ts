import assert from 'node:assert';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { analyzeTyposFile, detectTypo } from './typos.js';

test('detectTypo - flags near-miss color names', (_t: TestContext) => {
  assert.strictEqual(detectTypo('text-gry-500')?.suggestion, 'text-gray-500');
  assert.strictEqual(detectTypo('text-grey-500')?.suggestion, 'text-gray-500');
  assert.strictEqual(detectTypo('bg-slte-100')?.suggestion, 'bg-slate-100');
  assert.strictEqual(
    detectTypo('border-znc-200')?.suggestion,
    'border-zinc-200',
  );
});

test('detectTypo - preserves variant prefix and shade', (_t: TestContext) => {
  assert.strictEqual(
    detectTypo('hover:text-gry-600')?.suggestion,
    'hover:text-gray-600',
  );
  assert.strictEqual(detectTypo('fill-currnt')?.suggestion, 'fill-current');
});

test('detectTypo - ignores valid colors', (_t: TestContext) => {
  assert.strictEqual(detectTypo('text-gray-500'), null);
  assert.strictEqual(detectTypo('bg-red-500'), null);
  assert.strictEqual(detectTypo('text-white'), null);
});

test('detectTypo - ignores non-color utilities', (_t: TestContext) => {
  assert.strictEqual(detectTypo('text-center'), null);
  assert.strictEqual(detectTypo('text-balance'), null);
  assert.strictEqual(detectTypo('p-4'), null);
  assert.strictEqual(detectTypo('flex'), null);
});

test('detectTypo - ignores arbitrary values and unknown custom colors', (_t: TestContext) => {
  assert.strictEqual(detectTypo('bg-[#fff]'), null);
  assert.strictEqual(detectTypo('text-[12px]'), null);
  assert.strictEqual(detectTypo('bg-brand-500'), null);
});

test('detectTypo - skips too-short candidates to avoid false positives', (_t: TestContext) => {
  assert.strictEqual(detectTypo('text-rd-600'), null);
});

test('analyzeTyposFile - reports with line/col, honors suppression', (_t: TestContext) => {
  const path = join(tmpdir(), `typo-${Date.now()}.tsx`);
  const content =
    '<div className="text-gry-500" />\n{/* tailwind-canonical-disable-next-line */}\n<div className="bg-slte-100" />';
  writeFileSync(path, content, 'utf8');
  try {
    const findings = analyzeTyposFile(path);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].line, 1);
    assert.strictEqual(findings[0].col, 17);
    assert.strictEqual(findings[0].original, 'text-gry-500');
    assert.strictEqual(findings[0].suggestion, 'text-gray-500');
  } finally {
    unlinkSync(path);
  }
});
