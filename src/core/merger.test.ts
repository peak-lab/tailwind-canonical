import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { mergeFile } from './merger.js';

test('mergeFile - conflicting classes', async (t: TestContext) => {
  await t.test('removes redundant bg color (last wins)', async () => {
    const file = join(tmpdir(), `merger-test-${Date.now()}.tsx`);
    writeFileSync(
      file,
      '<div className="bg-red-500 bg-blue-500">x</div>',
      'utf8',
    );
    try {
      const count = await mergeFile(file);
      assert.strictEqual(count, 1);
      assert.ok(readFileSync(file, 'utf8').includes('bg-blue-500'));
      assert.ok(!readFileSync(file, 'utf8').includes('bg-red-500'));
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('removes redundant text size (last wins)', async () => {
    const file = join(tmpdir(), `merger-test-${Date.now()}.tsx`);
    writeFileSync(file, '<div className="text-sm text-xs">x</div>', 'utf8');
    try {
      const count = await mergeFile(file);
      assert.strictEqual(count, 1);
      assert.ok(readFileSync(file, 'utf8').includes('text-xs'));
      assert.ok(!readFileSync(file, 'utf8').includes('text-sm'));
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('collapses padding shorthand conflict', async () => {
    const file = join(tmpdir(), `merger-test-${Date.now()}.tsx`);
    writeFileSync(file, '<div className="px-2 py-1 p-4">x</div>', 'utf8');
    try {
      const count = await mergeFile(file);
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('p-4'));
      assert.ok(!result.includes('px-2'));
    } finally {
      unlinkSync(file);
    }
  });

  await t.test(
    'handles multiple className attributes in one file',
    async () => {
      const file = join(tmpdir(), `merger-test-${Date.now()}.tsx`);
      writeFileSync(
        file,
        '<div className="text-sm text-xs"><span className="bg-red-500 bg-blue-500">x</span></div>',
        'utf8',
      );
      try {
        const count = await mergeFile(file);
        assert.strictEqual(count, 2);
      } finally {
        unlinkSync(file);
      }
    },
  );
});

test('mergeFile - no-op cases', async (t: TestContext) => {
  await t.test('returns 0 when no conflicts', async () => {
    const file = join(tmpdir(), `merger-test-${Date.now()}.tsx`);
    const content = '<div className="flex items-center gap-4 text-sm">x</div>';
    writeFileSync(file, content, 'utf8');
    try {
      const count = await mergeFile(file);
      assert.strictEqual(count, 0);
      assert.strictEqual(readFileSync(file, 'utf8'), content);
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('variants do not conflict with base class', async () => {
    const file = join(tmpdir(), `merger-test-${Date.now()}.tsx`);
    const content = '<div className="text-sm hover:text-lg">x</div>';
    writeFileSync(file, content, 'utf8');
    try {
      const count = await mergeFile(file);
      assert.strictEqual(count, 0);
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('does not touch files with no className', async () => {
    const file = join(tmpdir(), `merger-test-${Date.now()}.tsx`);
    const content = '<div class="text-sm text-xs">x</div>';
    writeFileSync(file, content, 'utf8');
    try {
      const count = await mergeFile(file);
      assert.strictEqual(count, 0);
      assert.strictEqual(readFileSync(file, 'utf8'), content);
    } finally {
      unlinkSync(file);
    }
  });
});
