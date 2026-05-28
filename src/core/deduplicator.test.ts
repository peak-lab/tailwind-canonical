import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { dedupeFile, deduplicateClasses } from './deduplicator.js';

test('deduplicateClasses - exact duplicates', async (t: TestContext) => {
  await t.test('removes exact duplicate class', () => {
    assert.strictEqual(deduplicateClasses('text-sm text-sm'), 'text-sm');
  });

  await t.test('removes multiple exact duplicates', () => {
    assert.strictEqual(deduplicateClasses('flex flex flex'), 'flex');
  });

  await t.test('removes duplicate while preserving others', () => {
    const result = deduplicateClasses('flex items-center flex gap-4');
    assert.strictEqual(result.split(' ').filter((c) => c === 'flex').length, 1);
    assert.ok(result.includes('items-center'));
    assert.ok(result.includes('gap-4'));
  });

  await t.test('no-op when no duplicates', () => {
    assert.strictEqual(
      deduplicateClasses('flex items-center gap-4 text-sm'),
      'flex items-center gap-4 text-sm',
    );
  });

  await t.test('single class is unchanged', () => {
    assert.strictEqual(deduplicateClasses('flex'), 'flex');
  });

  await t.test('empty string returns empty string', () => {
    assert.strictEqual(deduplicateClasses(''), '');
  });
});

test('deduplicateClasses - display group', async (t: TestContext) => {
  await t.test('flex block → block (last wins)', () => {
    assert.strictEqual(deduplicateClasses('flex block'), 'block');
  });

  await t.test('block flex → flex (last wins)', () => {
    assert.strictEqual(deduplicateClasses('block flex'), 'flex');
  });

  await t.test('inline flex block → block (last wins)', () => {
    assert.strictEqual(deduplicateClasses('inline flex block'), 'block');
  });

  await t.test('grid hidden → hidden', () => {
    assert.strictEqual(deduplicateClasses('grid hidden'), 'hidden');
  });

  await t.test('preserves non-display classes alongside winner', () => {
    const result = deduplicateClasses('flex block items-center');
    assert.ok(result.includes('block'));
    assert.ok(!result.includes('flex'));
    assert.ok(result.includes('items-center'));
  });
});

test('deduplicateClasses - position group', async (t: TestContext) => {
  await t.test('relative absolute → absolute (last wins)', () => {
    assert.strictEqual(deduplicateClasses('relative absolute'), 'absolute');
  });

  await t.test('static fixed → fixed', () => {
    assert.strictEqual(deduplicateClasses('static fixed'), 'fixed');
  });
});

test('deduplicateClasses - padding shorthand', async (t: TestContext) => {
  await t.test('p-4 px-4 → p-4 (px same as p on x, no-op)', () => {
    const result = deduplicateClasses('p-4 px-4');
    assert.strictEqual(result, 'p-4');
  });

  await t.test('p-4 px-2 → py-4 px-2', () => {
    assert.strictEqual(deduplicateClasses('p-4 px-2'), 'py-4 px-2');
  });

  await t.test('p-4 py-2 → py-2 px-4', () => {
    assert.strictEqual(deduplicateClasses('p-4 py-2'), 'py-2 px-4');
  });

  await t.test('px-4 py-4 → p-4 (collapsed)', () => {
    assert.strictEqual(deduplicateClasses('px-4 py-4'), 'p-4');
  });

  await t.test('p-4 p-4 → p-4 (exact dup)', () => {
    assert.strictEqual(deduplicateClasses('p-4 p-4'), 'p-4');
  });

  await t.test('pt-2 pb-2 → py-2 (same axis)', () => {
    assert.strictEqual(deduplicateClasses('pt-2 pb-2'), 'py-2');
  });

  await t.test('pl-4 pr-4 → px-4', () => {
    assert.strictEqual(deduplicateClasses('pl-4 pr-4'), 'px-4');
  });

  await t.test('pt-2 pb-4 pl-2 pr-2 → px-2 pt-2 pb-4', () => {
    const result = deduplicateClasses('pt-2 pb-4 pl-2 pr-2');
    assert.ok(result.includes('px-2'));
    assert.ok(result.includes('pt-2'));
    assert.ok(result.includes('pb-4'));
  });
});

test('deduplicateClasses - margin shorthand', async (t: TestContext) => {
  await t.test('m-4 mx-2 → my-4 mx-2', () => {
    assert.strictEqual(deduplicateClasses('m-4 mx-2'), 'my-4 mx-2');
  });

  await t.test('m-4 my-2 → my-2 mx-4', () => {
    assert.strictEqual(deduplicateClasses('m-4 my-2'), 'my-2 mx-4');
  });

  await t.test('mx-4 my-4 → m-4', () => {
    assert.strictEqual(deduplicateClasses('mx-4 my-4'), 'm-4');
  });

  await t.test('m-4 mx-4 → m-4 (no-op same value)', () => {
    assert.strictEqual(deduplicateClasses('m-4 mx-4'), 'm-4');
  });
});

test('deduplicateClasses - no-op cases', async (t: TestContext) => {
  await t.test('non-conflicting classes unchanged', () => {
    const cls = 'rounded-lg border border-gray-200 shadow-sm';
    assert.strictEqual(deduplicateClasses(cls), cls);
  });

  await t.test('p and m together preserved independently', () => {
    const result = deduplicateClasses('p-4 m-4');
    assert.ok(result.includes('p-4'));
    assert.ok(result.includes('m-4'));
  });
});

test('dedupeFile', async (t: TestContext) => {
  await t.test('deduplicates exact duplicates in file', async () => {
    const file = join(tmpdir(), `dedup-test-${Date.now()}.tsx`);
    writeFileSync(
      file,
      '<div className="text-sm text-sm flex">x</div>',
      'utf8',
    );
    try {
      const count = dedupeFile(file);
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('text-sm'));
      assert.ok(!result.includes('text-sm text-sm'));
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('deduplicates display conflict in file', async () => {
    const file = join(tmpdir(), `dedup-test-${Date.now()}.tsx`);
    writeFileSync(
      file,
      '<div className="flex block items-center">x</div>',
      'utf8',
    );
    try {
      const count = dedupeFile(file);
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('block'));
      assert.ok(!result.includes('flex'));
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('returns 0 when no deduplication needed', async () => {
    const file = join(tmpdir(), `dedup-test-${Date.now()}.tsx`);
    const content = '<div className="flex items-center gap-4">x</div>';
    writeFileSync(file, content, 'utf8');
    try {
      const count = dedupeFile(file);
      assert.strictEqual(count, 0);
      assert.strictEqual(readFileSync(file, 'utf8'), content);
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('handles multiple className attributes', async () => {
    const file = join(tmpdir(), `dedup-test-${Date.now()}.tsx`);
    writeFileSync(
      file,
      '<div className="flex flex"><span className="text-sm text-sm">x</span></div>',
      'utf8',
    );
    try {
      const count = dedupeFile(file);
      assert.strictEqual(count, 2);
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('preserves single quotes', async () => {
    const file = join(tmpdir(), `dedup-test-${Date.now()}.tsx`);
    writeFileSync(file, "<div className='flex flex'>x</div>", 'utf8');
    try {
      await dedupeFile(file);
      assert.ok(readFileSync(file, 'utf8').includes("className='flex'"));
    } finally {
      unlinkSync(file);
    }
  });
});
