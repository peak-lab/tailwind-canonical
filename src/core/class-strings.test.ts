import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { replaceClassStrings } from './class-strings.js';
import { dedupeFile } from './deduplicator.js';
import { fixFile } from './fixer.js';
import { sortFile } from './sorter.js';

const FN_OPTS = { functionNames: ['cn', 'clsx'] };

test('replaceClassStrings - className= (existing behavior)', async (t: TestContext) => {
  await t.test('transforms className double-quoted', () => {
    const { result, count } = replaceClassStrings(
      '<div className="flex p-4">',
      (s) => s.toUpperCase(),
    );
    assert.strictEqual(result, '<div className="FLEX P-4">');
    assert.strictEqual(count, 1);
  });

  await t.test('no-op when transform returns same value', () => {
    const { result, count } = replaceClassStrings(
      '<div className="flex">',
      (s) => s,
    );
    assert.strictEqual(result, '<div className="flex">');
    assert.strictEqual(count, 0);
  });
});

test('replaceClassStrings - function call support', async (t: TestContext) => {
  await t.test('transforms string literals in cn()', () => {
    const { result, count } = replaceClassStrings(
      'cn("flex p-4", "text-sm")',
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, 'cn("FLEX P-4", "TEXT-SM")');
    assert.strictEqual(count, 2);
  });

  await t.test('transforms string literals in clsx()', () => {
    const { result, count } = replaceClassStrings(
      "clsx('flex p-4')",
      (s) => s.split(' ').reverse().join(' '),
      FN_OPTS,
    );
    assert.strictEqual(result, "clsx('p-4 flex')");
    assert.strictEqual(count, 1);
  });

  await t.test('handles cn() with condition', () => {
    const { result, count } = replaceClassStrings(
      'cn("flex p-4", condition && "text-sm")',
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, 'cn("FLEX P-4", condition && "TEXT-SM")');
    assert.strictEqual(count, 2);
  });

  await t.test('handles cn() with array', () => {
    const { result, count } = replaceClassStrings(
      'cn(["flex", "p-4"])',
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, 'cn(["FLEX", "P-4"])');
    assert.strictEqual(count, 2);
  });

  await t.test('no-op when transform returns same value', () => {
    const { result, count } = replaceClassStrings(
      'cn("flex")',
      (s) => s,
      FN_OPTS,
    );
    assert.strictEqual(result, 'cn("flex")');
    assert.strictEqual(count, 0);
  });

  await t.test('ignores non-configured function names', () => {
    const { result, count } = replaceClassStrings(
      'tv("flex p-4")',
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, 'tv("flex p-4")');
    assert.strictEqual(count, 0);
  });

  await t.test('handles both className= and cn() in same file', () => {
    const content = '<div className="flex">x</div>\ncn("p-4 text-sm")';
    const { result, count } = replaceClassStrings(
      content,
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.ok(result.includes('className="FLEX"'));
    assert.ok(result.includes('cn("P-4 TEXT-SM")'));
    assert.strictEqual(count, 2);
  });

  await t.test('handles nested cn() calls', () => {
    const { result, count } = replaceClassStrings(
      'cn("flex", cn("p-4"))',
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, 'cn("FLEX", cn("P-4"))');
    assert.strictEqual(count, 2);
  });
});

test('fixFile with functionNames', async (t: TestContext) => {
  await t.test('fixes arbitrary values inside cn()', async () => {
    const file = join(tmpdir(), `fn-fix-${Date.now()}.tsx`);
    writeFileSync(file, 'cn("flex text-[12px] h-[64px]")', 'utf8');
    try {
      const count = fixFile(file, { functionNames: ['cn'] });
      assert.strictEqual(count, 2);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('text-xs'));
      assert.ok(result.includes('h-16'));
      assert.ok(!result.includes('text-[12px]'));
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('no-op without functionNames config', async () => {
    const file = join(tmpdir(), `fn-fix-${Date.now()}.tsx`);
    const content = 'cn("flex text-[12px]")';
    writeFileSync(file, content, 'utf8');
    try {
      const count = fixFile(file, {});
      assert.strictEqual(count, 0);
      assert.strictEqual(readFileSync(file, 'utf8'), content);
    } finally {
      unlinkSync(file);
    }
  });
});

test('dedupeFile with functionNames', async (t: TestContext) => {
  await t.test('deduplicates inside cn()', async () => {
    const file = join(tmpdir(), `fn-dedup-${Date.now()}.tsx`);
    writeFileSync(file, 'cn("flex flex p-4 px-4")', 'utf8');
    try {
      const count = dedupeFile(file, { functionNames: ['cn'] });
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(!result.includes('flex flex'));
      assert.ok(result.includes('p-4'));
      assert.ok(!result.includes('px-4'));
    } finally {
      unlinkSync(file);
    }
  });
});

test('sortFile with functionNames', async (t: TestContext) => {
  await t.test('sorts classes inside cn()', async () => {
    const file = join(tmpdir(), `fn-sort-${Date.now()}.tsx`);
    writeFileSync(file, 'cn("text-sm flex p-4")', 'utf8');
    try {
      const count = sortFile(file, { functionNames: ['cn'] });
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('"flex p-4 text-sm"'));
    } finally {
      unlinkSync(file);
    }
  });
});

test('replaceClassStrings - attributeNames config', async (t: TestContext) => {
  await t.test('transforms class= attribute in HTML', () => {
    const { result, count } = replaceClassStrings(
      '<div class="text-[12px] flex">',
      (s) => s.replace('text-[12px]', 'text-xs'),
      { attributeNames: ['class'] },
    );
    assert.strictEqual(count, 1);
    assert.ok(result.includes('class="text-xs flex"'));
  });

  await t.test('transforms :class= attribute (Vue)', () => {
    const { result, count } = replaceClassStrings(
      ':class="text-[14px] p-4"',
      (s) => s.replace('text-[14px]', 'text-sm'),
      { attributeNames: [':class'] },
    );
    assert.strictEqual(count, 1);
    assert.ok(result.includes(':class="text-sm p-4"'));
  });

  await t.test('transforms multiple attribute names', () => {
    const { result, count } = replaceClassStrings(
      '<div class="text-[12px]" className="text-[14px]">',
      (s) =>
        s.replace('text-[12px]', 'text-xs').replace('text-[14px]', 'text-sm'),
      { attributeNames: ['class', 'className'] },
    );
    assert.strictEqual(count, 2);
    assert.ok(result.includes('class="text-xs"'));
    assert.ok(result.includes('className="text-sm"'));
  });

  await t.test('default only matches className, not class', () => {
    const input = '<div class="text-[12px]">';
    const { count } = replaceClassStrings(input, (s) =>
      s.replace('text-[12px]', 'text-xs'),
    );
    assert.strictEqual(count, 0);
  });

  await t.test('preserves attribute name in output', () => {
    const { result } = replaceClassStrings('class="flex"', (s) => s, {
      attributeNames: ['class'],
    });
    assert.ok(result.includes('class="flex"'));
    assert.ok(!result.includes('className='));
  });
});

test('fixFile with attributeNames', async (t: TestContext) => {
  await t.test('fixes class= in HTML file', async () => {
    const file = join(tmpdir(), `attr-fix-${Date.now()}.html`);
    writeFileSync(file, '<div class="text-[12px] p-4">', 'utf8');
    try {
      const count = fixFile(file, { attributeNames: ['class'] });
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('class="text-xs p-4"'));
    } finally {
      unlinkSync(file);
    }
  });
});
