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
  const suggestion = api.suggestCanonical('text-[12px]', {});
  assert.strictEqual(suggestion?.canonical, 'text-xs');
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
