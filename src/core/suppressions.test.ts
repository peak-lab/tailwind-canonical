import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { analyzeFile } from './analyzer.js';
import { fixFile } from './fixer.js';
import { createPositionLookup, getSuppressedLines } from './suppressions.js';

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

test('createPositionLookup - maps offsets to 1-based lines', (_t: TestContext) => {
  const content = 'ab\ncd\nef';
  const positionAt = createPositionLookup(content);
  assert.strictEqual(positionAt(0).line, 1);
  assert.strictEqual(positionAt(3).line, 2);
  assert.strictEqual(positionAt(6).line, 3);
});

test('positions preserve UTF-16 columns, CRLF and newline boundaries', () => {
  const content = 'é😀\r\nx\n\n';
  const positionAt = createPositionLookup(content);
  for (const [offset, line, col] of [
    [8, 4, 1],
    [0, 1, 1],
    [3, 1, 4],
    [4, 1, 5],
    [5, 2, 1],
    [6, 2, 2],
    [7, 3, 1],
    [2, 1, 3],
    [10, 4, 3],
  ]) {
    assert.deepStrictEqual(positionAt(offset), { line, col });
  }
  assert.deepStrictEqual(createPositionLookup('')(0), { line: 1, col: 1 });
  assert.deepStrictEqual(createPositionLookup('abc')(3), { line: 1, col: 4 });
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

test('indexed positions preserve suppressions across attribute and call passes', () => {
  const content = [
    '<div className = "text-[12px]" />',
    'const first = cn("h-[64px]");',
    '// tailwind-canonical-disable-next-line',
    'const ignored = cn("text-[14px]");',
    'const last = cn("text-[16px]");',
  ].join('\r\n');
  withFile(content, (path) => {
    const config = { functionNames: ['cn'] };
    const findings = analyzeFile(path, config);
    assert.deepStrictEqual(
      findings.map(({ line, col }) => ({ line, col })),
      [
        { line: 1, col: 19 },
        { line: 2, col: 19 },
        { line: 5, col: 18 },
      ],
    );
    assert.strictEqual(fixFile(path, config), 3);
    const after = readFileSync(path, 'utf8');
    assert.ok(after.includes('cn("text-[14px]")'));
    assert.ok(after.includes('cn("text-base")'));
    assert.strictEqual(analyzeFile(path, config).length, 0);
  });
});
