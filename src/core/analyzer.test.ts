import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { analyzeFile } from './analyzer.js';
import { fixFile } from './fixer.js';
import type { Config } from './rules.js';

function withFile(content: string, fn: (path: string) => void): void {
  const path = join(tmpdir(), `analyze-${Date.now()}-${Math.random()}.tsx`);
  writeFileSync(path, content, 'utf8');
  try {
    fn(path);
  } finally {
    unlinkSync(path);
  }
}

test('analyzeFile - reports arbitrary class with line/col', (_t: TestContext) => {
  withFile('<div className="text-[12px]" />', (path) => {
    const findings = analyzeFile(path);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].suggestion.canonical, 'text-xs');
    assert.strictEqual(findings[0].line, 1);
    assert.strictEqual(findings[0].col, 17);
  });
});

test('analyzeFile - multi-line col tracking', (_t: TestContext) => {
  withFile('<div\n  className="h-[64px]"\n/>', (path) => {
    const findings = analyzeFile(path);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].line, 2);
    assert.strictEqual(findings[0].col, 14);
    assert.strictEqual(findings[0].suggestion.canonical, 'h-16');
  });
});

test('analyzeFile - exact col for finding on a later line', (_t: TestContext) => {
  // line 1 is 11 chars + newline; class value starts at col 17 on line 3
  withFile('line one\n\n<div className="text-[12px]" />', (path) => {
    const findings = analyzeFile(path);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].line, 3);
    assert.strictEqual(findings[0].col, 17);
  });
});

test('analyzeFile - multiple findings on one line have distinct cols', (_t: TestContext) => {
  withFile('<div className="text-[12px] h-[64px]" />', (path) => {
    const findings = analyzeFile(path);
    assert.strictEqual(findings.length, 2);
    assert.deepEqual(
      findings.map((f) => f.suggestion.canonical),
      ['text-xs', 'h-16'],
    );
    assert.strictEqual(findings[0].col, 17);
    assert.strictEqual(findings[1].col, 29);
    assert.ok(findings[1].col > findings[0].col);
  });
});

test('analyzeFile - custom attributeNames with line/col', (_t: TestContext) => {
  withFile('<div class="text-[12px]" />', (path) => {
    const findings = analyzeFile(path, { attributeNames: ['class'] });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].col, 13);
    assert.strictEqual(findings[0].suggestion.canonical, 'text-xs');
  });
});

test('analyzeFile - detects classes inside configured function calls', (_t: TestContext) => {
  const config: Config = { functionNames: ['cn'] };
  withFile('const x = cn("text-[12px]", "flex")', (path) => {
    const findings = analyzeFile(path, config);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].suggestion.original, 'text-[12px]');
  });
});

test('analyzeFile - className={`...`} not matched (parity with fixer)', (_t: TestContext) => {
  withFile('<div className={`text-[18px] px-[16px]`} />', (path) => {
    assert.strictEqual(analyzeFile(path).length, 0);
  });
});

test('analyzeFile - check and fix agree on the same token set', async (t: TestContext) => {
  const cases: Array<{ content: string; config?: Config }> = [
    { content: '<div className="text-[12px] h-[64px] flex" />' },
    {
      content: 'const c = cn("text-[12px]", "p-[16px]")',
      config: { functionNames: ['cn'] },
    },
    {
      content: '<span class="text-[14px]" />',
      config: { attributeNames: ['class'] },
    },
    { content: '<div className={`text-[18px]`} />' },
  ];

  for (const [i, { content, config }] of cases.entries()) {
    await t.test(`case ${i}`, () => {
      const findingCount = analyzeFile(writeTmp(content), config).length;
      const fixCount = fixFile(writeTmp(content), config);
      assert.strictEqual(
        findingCount,
        fixCount,
        `analyze=${findingCount} fix=${fixCount} for: ${content}`,
      );
    });
  }
});

function writeTmp(content: string): string {
  const path = join(tmpdir(), `parity-${Date.now()}-${Math.random()}.tsx`);
  writeFileSync(path, content, 'utf8');
  return path;
}

test('analyzeFile - returns empty for clean file', (_t: TestContext) => {
  withFile('<div className="flex h-16 text-xs" />', (path) => {
    assert.deepEqual(analyzeFile(path), []);
    assert.strictEqual(readFileSync(path, 'utf8').length > 0, true);
  });
});
