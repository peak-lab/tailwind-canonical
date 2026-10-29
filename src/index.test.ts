import assert from 'node:assert';
import { type TestContext, test } from 'node:test';
import * as api from './index.js';

test('public barrel - exposes the stable value surface', (_t: TestContext) => {
  const expected = [
    'analyzeFile',
    'loadConfig',
    'analyzeConsistency',
    'dedupeFile',
    'deduplicateClasses',
    'fixFile',
    'mergeFile',
    'suggestCanonical',
    'resolveTargets',
    'scanFiles',
    'DEFAULT_SORT_ORDER',
    'sortClasses',
    'sortFile',
    'analyzeTyposFile',
    'detectTypo',
  ] as const;
  for (const name of expected) {
    assert.ok(name in api, `barrel should export ${name}`);
  }
});

test('public barrel - exported functions are callable', (_t: TestContext) => {
  assert.strictEqual(typeof api.suggestCanonical, 'function');
  assert.strictEqual(typeof api.fixFile, 'function');
  assert.strictEqual(typeof api.mergeFile, 'function');
  assert.strictEqual(typeof api.loadConfig, 'function');
  assert.strictEqual(typeof api.analyzeFile, 'function');
  assert.strictEqual(typeof api.analyzeConsistency, 'function');
  assert.strictEqual(typeof api.detectTypo, 'function');
  assert.strictEqual(typeof api.sortClasses, 'function');
});

test('public barrel - wired functions execute end to end', (_t: TestContext) => {
  const suggestion = api.suggestCanonical('w-[12px]', {});
  assert.strictEqual(suggestion?.canonical, 'w-3');
  assert.deepEqual(api.detectTypo('text-gry-500'), {
    suggestion: 'text-gray-500',
  });
  assert.ok(Array.isArray(api.DEFAULT_SORT_ORDER));
});

test('public barrel - internal plumbing stays out of the surface', (_t: TestContext) => {
  for (const internal of [
    'extractClassStrings',
    'replaceClassStrings',
    'validateConfig',
    'collectClasses',
    'analyzeConsistencyFiles',
    'makeLineSuppressor',
    'getSuppressedLines',
  ]) {
    assert.ok(!(internal in api), `${internal} must not be re-exported`);
  }
});

test('public API preserves a custom theme unless a pixel mapping is explicitly configured', async () => {
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import(
    'node:fs'
  );
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'twc-custom-theme-'));
  const file = join(dir, 'component.tsx');
  const content = '<div className="text-[12px] p-[16px] rounded-[8px]" />';
  try {
    writeFileSync(file, content);
    assert.deepEqual(api.analyzeFile(file, { useDefaultTheme: false }), []);
    assert.equal(api.fixFile(file, { useDefaultTheme: false }), 0);
    assert.equal(readFileSync(file, 'utf8'), content);
    const config = {
      useDefaultTheme: false,
      customSpacingTokens: { 16: 'wide' },
    };
    assert.equal(api.analyzeFile(file, config).length, 1);
    assert.equal(api.fixFile(file, config), 1);
    assert.equal(
      readFileSync(file, 'utf8'),
      '<div className="text-[12px] p-wide rounded-[8px]" />',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('public API preserves arbitrary font-size and leading unless callers explicitly allow line-height changes', async () => {
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import(
    'node:fs'
  );
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'twc-font-semantics-'));
  const file = join(dir, 'font.tsx');
  try {
    for (const tailwindVersion of [3, 4] as const) {
      for (const original of [
        'text-[12px]',
        'hover:text-[0.75rem]!',
        '!text-[14px]',
      ]) {
        assert.strictEqual(
          api.suggestCanonical(original, { tailwindVersion }),
          null,
        );
        assert.strictEqual(
          api.suggestCanonical(original, {
            tailwindVersion,
            allowTextSizeLineHeightChanges: false,
          }),
          null,
        );
      }
      for (const leading of ['', 'leading-6 ']) {
        const content = `<div className="${leading}text-[12px] hover:text-[0.75rem]! !text-[14px]" />`;
        writeFileSync(file, content);
        assert.deepStrictEqual(api.analyzeFile(file, { tailwindVersion }), []);
        assert.strictEqual(api.fixFile(file, { tailwindVersion }), 0);
        assert.strictEqual(readFileSync(file, 'utf8'), content);
        const permissive = {
          tailwindVersion,
          allowTextSizeLineHeightChanges: true,
        };
        assert.strictEqual(api.analyzeFile(file, permissive).length, 3);
        assert.strictEqual(api.fixFile(file, permissive), 3);
        assert.strictEqual(
          readFileSync(file, 'utf8'),
          `<div className="${leading}text-xs hover:text-xs! !text-sm" />`,
        );
      }
    }
    assert.strictEqual(
      api.suggestCanonical('text-[11px]', { customTextTokens: { 11: 'tiny' } }),
      null,
    );
    assert.strictEqual(
      api.suggestCanonical('text-[11px]', {
        customTextTokens: { 11: 'tiny' },
        allowTextSizeLineHeightChanges: true,
      })?.canonical,
      'text-tiny',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
