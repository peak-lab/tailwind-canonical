import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { analyzeFile } from './analyzer.js';
import { fixFile } from './fixer.js';
import { getSuppressedLines, lineAt } from './suppressions.js';

function withFile(content: string, fn: (path: string) => void): void {
  const path = join(tmpdir(), `sup-${Date.now()}-${Math.random()}.tsx`);
  writeFileSync(path, content, 'utf8');
  try {
    fn(path);
  } finally {
    unlinkSync(path);
  }
}

test('getSuppressedLines - disable-next-line targets the next line only', (_t: TestContext) => {
  const content = 'a\n// tailwind-canonical-disable-next-line\nb\nc';
  assert.deepEqual([...getSuppressedLines(content)], [3]);
});

test('getSuppressedLines - block disable/enable spans lines', (_t: TestContext) => {
  const content = [
    'a', // 1
    '// tailwind-canonical-disable', // 2
    'b', // 3
    'c', // 4
    '// tailwind-canonical-enable', // 5
    'd', // 6
  ].join('\n');
  assert.deepEqual(
    [...getSuppressedLines(content)].sort((x, y) => x - y),
    [2, 3, 4],
  );
});

test('getSuppressedLines - disable without enable runs to EOF', (_t: TestContext) => {
  const content = 'a\n// tailwind-canonical-disable\nb\nc';
  assert.deepEqual(
    [...getSuppressedLines(content)].sort((x, y) => x - y),
    [2, 3, 4],
  );
});

test('getSuppressedLines - no comments means nothing suppressed', (_t: TestContext) => {
  assert.strictEqual(getSuppressedLines('a\nb\nc').size, 0);
});

test('lineAt - maps offsets to 1-based lines', (_t: TestContext) => {
  const content = 'ab\ncd\nef';
  assert.strictEqual(lineAt(content, 0), 1);
  assert.strictEqual(lineAt(content, 3), 2);
  assert.strictEqual(lineAt(content, 6), 3);
});

test('analyzeFile - skips findings on a disable-next-line', (_t: TestContext) => {
  const content =
    '{/* tailwind-canonical-disable-next-line */}\n<span className="text-[12px]" />\n<span className="h-[64px]" />';
  withFile(content, (path) => {
    const findings = analyzeFile(path);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].suggestion.canonical, 'h-16');
  });
});

test('analyzeFile - skips findings inside a disable/enable block', (_t: TestContext) => {
  const content =
    '// tailwind-canonical-disable\n<a className="text-[12px]" />\n// tailwind-canonical-enable\n<a className="h-[64px]" />';
  withFile(content, (path) => {
    const findings = analyzeFile(path);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].suggestion.canonical, 'h-16');
  });
});

test('fixFile - does not rewrite suppressed lines', (_t: TestContext) => {
  const content =
    '{/* tailwind-canonical-disable-next-line */}\n<span className="text-[12px]" />\n<span className="h-[64px]" />';
  withFile(content, (path) => {
    const count = fixFile(path);
    assert.strictEqual(count, 1);
    const after = readFileSync(path, 'utf8');
    assert.ok(after.includes('text-[12px]'), 'suppressed class untouched');
    assert.ok(after.includes('h-16'), 'non-suppressed class fixed');
  });
});

test('fixFile - block suppression leaves enclosed classes intact', (_t: TestContext) => {
  const content =
    '// tailwind-canonical-disable\n<a className="text-[12px]" />\n// tailwind-canonical-enable\n<a className="text-[14px]" />';
  withFile(content, (path) => {
    const count = fixFile(path);
    assert.strictEqual(count, 1);
    const after = readFileSync(path, 'utf8');
    assert.ok(after.includes('text-[12px]'));
    assert.ok(after.includes('text-sm'));
  });
});
