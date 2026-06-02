import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import {
  DEFAULT_SORT_ORDER,
  type SortCategory,
  sortClasses,
  sortFile,
} from './sorter.js';

test('sortClasses - roadmap example', (_t: TestContext) => {
  assert.strictEqual(
    sortClasses('text-sm bg-red-500 flex h-10 w-full p-4 rounded'),
    'flex h-10 w-full rounded p-4 text-sm bg-red-500',
  );
});

test('sortClasses - already sorted is no-op', (_t: TestContext) => {
  const cls = 'flex h-10 w-full rounded p-4 text-sm bg-red-500';
  assert.strictEqual(sortClasses(cls), cls);
});

test('sortClasses - single class unchanged', (_t: TestContext) => {
  assert.strictEqual(sortClasses('flex'), 'flex');
});

test('sortClasses - empty string', (_t: TestContext) => {
  assert.strictEqual(sortClasses(''), '');
});

test('sortClasses - position before display', async (t: TestContext) => {
  await t.test('absolute before flex', () => {
    assert.strictEqual(sortClasses('flex absolute'), 'absolute flex');
  });

  await t.test('inset before display', () => {
    assert.strictEqual(sortClasses('flex inset-0'), 'inset-0 flex');
  });

  await t.test('z-index with position', () => {
    assert.strictEqual(sortClasses('flex z-10 absolute'), 'absolute z-10 flex');
  });
});

test('sortClasses - display before sizing', async (t: TestContext) => {
  await t.test('flex before w and h', () => {
    assert.strictEqual(sortClasses('w-full h-10 flex'), 'flex w-full h-10');
  });
});

test('sortClasses - sizing before spacing', async (t: TestContext) => {
  await t.test('w before p', () => {
    assert.strictEqual(sortClasses('p-4 w-full'), 'w-full p-4');
  });
});

test('sortClasses - border before spacing', async (t: TestContext) => {
  await t.test('rounded before p', () => {
    assert.strictEqual(sortClasses('p-4 rounded-lg'), 'rounded-lg p-4');
  });

  await t.test('border before m', () => {
    assert.strictEqual(sortClasses('m-2 border'), 'border m-2');
  });
});

test('sortClasses - typography before colors', async (t: TestContext) => {
  await t.test('text-sm before text-red-500', () => {
    assert.strictEqual(
      sortClasses('text-red-500 text-sm'),
      'text-sm text-red-500',
    );
  });

  await t.test('font-bold before bg', () => {
    assert.strictEqual(sortClasses('bg-white font-bold'), 'font-bold bg-white');
  });
});

test('sortClasses - effects after colors', async (t: TestContext) => {
  await t.test('bg before opacity', () => {
    assert.strictEqual(
      sortClasses('opacity-50 bg-red-500'),
      'bg-red-500 opacity-50',
    );
  });

  await t.test('shadow after bg', () => {
    assert.strictEqual(sortClasses('shadow-lg bg-white'), 'bg-white shadow-lg');
  });
});

test('sortClasses - stable within same category', async (t: TestContext) => {
  await t.test('w and h preserve relative order', () => {
    const result = sortClasses('p-4 w-full h-10');
    const wi = result.indexOf('w-full');
    const hi = result.indexOf('h-10');
    assert.ok(wi < hi, 'w before h (original order)');
  });
});

test('sortClasses - variants after base classes', async (t: TestContext) => {
  await t.test('hover: goes after base', () => {
    const result = sortClasses('hover:bg-blue-600 bg-blue-500 flex');
    assert.ok(result.startsWith('flex bg-blue-500'), `got: ${result}`);
    assert.ok(result.includes('hover:bg-blue-600'));
  });

  await t.test('responsive before state variants', () => {
    const result = sortClasses('hover:flex sm:flex flex');
    const smIdx = result.indexOf('sm:flex');
    const hoverIdx = result.indexOf('hover:flex');
    assert.ok(
      smIdx < hoverIdx,
      `sm: should come before hover: — got: ${result}`,
    );
  });
});

test('sortClasses - unknown classes go last', (_t: TestContext) => {
  const result = sortClasses('card-header flex p-4');
  assert.ok(result.startsWith('flex'), `got: ${result}`);
  assert.ok(result.endsWith('card-header'), `got: ${result}`);
});

test('sortClasses - flex/grid layout props', async (t: TestContext) => {
  await t.test('items-center after flex', () => {
    const result = sortClasses('items-center flex gap-4');
    const flexIdx = result.indexOf('flex');
    const itemsIdx = result.indexOf('items-center');
    assert.ok(flexIdx < itemsIdx, `flex before items-center — got: ${result}`);
  });
});

test('sortFile', async (t: TestContext) => {
  await t.test('sorts classes in file', async () => {
    const file = join(tmpdir(), `sort-test-${Date.now()}.tsx`);
    writeFileSync(
      file,
      '<div className="text-sm bg-red-500 flex h-10 w-full p-4 rounded">x</div>',
      'utf8',
    );
    try {
      const count = sortFile(file);
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(
        result.includes('flex h-10 w-full rounded p-4 text-sm bg-red-500'),
      );
    } finally {
      unlinkSync(file);
    }
  });

  await t.test('returns 0 when already sorted', async () => {
    const file = join(tmpdir(), `sort-test-${Date.now()}.tsx`);
    const content =
      '<div className="flex h-10 w-full rounded p-4 text-sm bg-red-500">x</div>';
    writeFileSync(file, content, 'utf8');
    try {
      const count = sortFile(file);
      assert.strictEqual(count, 0);
      assert.strictEqual(readFileSync(file, 'utf8'), content);
    } finally {
      unlinkSync(file);
    }
  });
});

test('sortClasses - configurable sortOrder', async (t: TestContext) => {
  await t.test('explicit order overrides default', () => {
    const order: SortCategory[] = ['colors', 'spacing', 'display'];
    assert.strictEqual(
      sortClasses('flex p-4 bg-red-500', order),
      'bg-red-500 p-4 flex',
    );
  });

  await t.test('categories omitted from order go to end', () => {
    const order: SortCategory[] = ['spacing'];
    const result = sortClasses('flex p-4 text-sm', order);
    assert.ok(result.startsWith('p-4'), `got: ${result}`);
  });

  await t.test('unknown classes still go to end', () => {
    const order: SortCategory[] = ['display', 'spacing'];
    const result = sortClasses('custom-thing flex p-4', order);
    assert.strictEqual(result, 'flex p-4 custom-thing');
  });

  await t.test('empty sortOrder falls back to default', () => {
    assert.strictEqual(
      sortClasses('text-sm flex p-4', []),
      sortClasses('text-sm flex p-4'),
    );
  });

  await t.test('variants still sort after base classes', () => {
    const order: SortCategory[] = ['spacing', 'display'];
    const result = sortClasses('md:flex p-4 flex', order);
    assert.ok(
      result.indexOf('md:flex') > result.indexOf('flex'),
      `responsive variant should trail base — got: ${result}`,
    );
  });

  await t.test('DEFAULT_SORT_ORDER reproduces default behavior', () => {
    const cls = 'text-sm bg-red-500 flex h-10 w-full p-4 rounded';
    assert.strictEqual(sortClasses(cls, DEFAULT_SORT_ORDER), sortClasses(cls));
  });
});

test('sortFile - respects sortOrder argument', async (_t: TestContext) => {
  const file = join(tmpdir(), `sort-order-${Date.now()}.tsx`);
  writeFileSync(file, '<div className="flex p-4 bg-red-500">x</div>', 'utf8');
  try {
    const order: SortCategory[] = ['colors', 'spacing', 'display'];
    const count = sortFile(file, {}, order);
    assert.strictEqual(count, 1);
    assert.ok(readFileSync(file, 'utf8').includes('bg-red-500 p-4 flex'));
  } finally {
    unlinkSync(file);
  }
});
