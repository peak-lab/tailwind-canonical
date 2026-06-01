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
    const result = deduplicateClasses('flex items-center gap-4 text-sm');
    const cls = result.split(' ');
    assert.ok(cls.includes('flex'));
    assert.ok(cls.includes('items-center'));
    assert.ok(cls.includes('gap-4'));
    assert.ok(cls.includes('text-sm'));
    assert.strictEqual(cls.length, 4);
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

test('deduplicateClasses - border-width shorthand', async (t: TestContext) => {
  await t.test('all 4 sides same → border-{n}', () => {
    assert.strictEqual(
      deduplicateClasses('border-t-2 border-b-2 border-l-2 border-r-2'),
      'border-2',
    );
  });

  await t.test('border-x-2 border-y-2 → border-2', () => {
    assert.strictEqual(deduplicateClasses('border-x-2 border-y-2'), 'border-2');
  });

  await t.test('border-t-2 border-b-2 → border-y-2', () => {
    assert.strictEqual(
      deduplicateClasses('border-t-2 border-b-2'),
      'border-y-2',
    );
  });

  await t.test('border-l-4 border-r-4 → border-x-4', () => {
    assert.strictEqual(
      deduplicateClasses('border-l-4 border-r-4'),
      'border-x-4',
    );
  });

  await t.test('border-2 border-t-4 → border-x-2 border-t-4 border-b-2', () => {
    assert.strictEqual(
      deduplicateClasses('border-2 border-t-4'),
      'border-x-2 border-t-4 border-b-2',
    );
  });

  await t.test(
    'border-t-2 border-b-4 (different values) no full collapse',
    () => {
      const result = deduplicateClasses('border-t-2 border-b-4');
      assert.ok(result.includes('border-t-2'));
      assert.ok(result.includes('border-b-4'));
    },
  );

  await t.test('does not match border-gray-200 (color, not width)', () => {
    const cls = 'border border-gray-200';
    assert.strictEqual(deduplicateClasses(cls), cls);
  });

  await t.test('border-4 exact duplicate → border-4', () => {
    assert.strictEqual(deduplicateClasses('border-4 border-4'), 'border-4');
  });
});

test('deduplicateClasses - inset shorthand', async (t: TestContext) => {
  await t.test('top right bottom left same → inset-{n}', () => {
    assert.strictEqual(
      deduplicateClasses('top-4 right-4 bottom-4 left-4'),
      'inset-4',
    );
  });

  await t.test('top-4 bottom-4 → inset-y-4', () => {
    assert.strictEqual(deduplicateClasses('top-4 bottom-4'), 'inset-y-4');
  });

  await t.test('left-2 right-2 → inset-x-2', () => {
    assert.strictEqual(deduplicateClasses('left-2 right-2'), 'inset-x-2');
  });

  await t.test('inset-4 top-0 → override top via last-wins', () => {
    assert.strictEqual(
      deduplicateClasses('inset-4 top-0'),
      'inset-x-4 top-0 bottom-4',
    );
  });

  await t.test('inset-x-4 inset-y-4 → inset-4', () => {
    assert.strictEqual(deduplicateClasses('inset-x-4 inset-y-4'), 'inset-4');
  });

  await t.test('top-4 alone unchanged', () => {
    assert.strictEqual(deduplicateClasses('top-4 flex'), 'flex top-4');
  });
});

test('deduplicateClasses - gap shorthand', async (t: TestContext) => {
  await t.test('gap-x-4 gap-y-4 → gap-4', () => {
    assert.strictEqual(deduplicateClasses('gap-x-4 gap-y-4'), 'gap-4');
  });

  await t.test('gap-4 gap-x-2 → gap-y-4 gap-x-2', () => {
    assert.strictEqual(deduplicateClasses('gap-4 gap-x-2'), 'gap-y-4 gap-x-2');
  });

  await t.test('gap-4 gap-y-2 → gap-y-2 gap-x-4', () => {
    assert.strictEqual(deduplicateClasses('gap-4 gap-y-2'), 'gap-y-2 gap-x-4');
  });

  await t.test('gap-4 gap-4 → gap-4 (exact dup)', () => {
    assert.strictEqual(deduplicateClasses('gap-4 gap-4'), 'gap-4');
  });
});

test('deduplicateClasses - scroll-p shorthand', async (t: TestContext) => {
  await t.test('scroll-pt-4 scroll-pb-4 → scroll-py-4', () => {
    assert.strictEqual(
      deduplicateClasses('scroll-pt-4 scroll-pb-4'),
      'scroll-py-4',
    );
  });

  await t.test('scroll-px-4 scroll-py-4 → scroll-p-4', () => {
    assert.strictEqual(
      deduplicateClasses('scroll-px-4 scroll-py-4'),
      'scroll-p-4',
    );
  });
});

test('deduplicateClasses - scroll-m shorthand', async (t: TestContext) => {
  await t.test('scroll-mt-2 scroll-mb-2 → scroll-my-2', () => {
    assert.strictEqual(
      deduplicateClasses('scroll-mt-2 scroll-mb-2'),
      'scroll-my-2',
    );
  });

  await t.test('scroll-mx-4 scroll-my-4 → scroll-m-4', () => {
    assert.strictEqual(
      deduplicateClasses('scroll-mx-4 scroll-my-4'),
      'scroll-m-4',
    );
  });
});

test('deduplicateClasses - rounded corner collapse', async (t: TestContext) => {
  await t.test('all 4 individual corners same → rounded-{val}', () => {
    assert.strictEqual(
      deduplicateClasses(
        'rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-lg',
      ),
      'rounded-lg',
    );
  });

  await t.test('rounded-t + rounded-b same → rounded-{val}', () => {
    assert.strictEqual(
      deduplicateClasses('rounded-t-lg rounded-b-lg'),
      'rounded-lg',
    );
  });

  await t.test(
    'top pair (tl==tr) + bottom pair (bl==br), different → rounded-t rounded-b',
    () => {
      assert.strictEqual(
        deduplicateClasses(
          'rounded-tl-lg rounded-tr-lg rounded-bl-md rounded-br-md',
        ),
        'rounded-t-lg rounded-b-md',
      );
    },
  );

  await t.test(
    'left pair (tl==bl) + right pair (tr==br) → rounded-l rounded-r',
    () => {
      assert.strictEqual(
        deduplicateClasses(
          'rounded-tl-lg rounded-bl-lg rounded-tr-md rounded-br-md',
        ),
        'rounded-l-lg rounded-r-md',
      );
    },
  );

  await t.test('rounded-tl-lg rounded-tr-lg → rounded-t-lg', () => {
    assert.strictEqual(
      deduplicateClasses('rounded-tl-lg rounded-tr-lg'),
      'rounded-t-lg',
    );
  });

  await t.test('rounded-tl rounded-bl (default size) → rounded-l', () => {
    assert.strictEqual(
      deduplicateClasses('rounded-tl rounded-bl'),
      'rounded-l',
    );
  });

  await t.test('rounded-lg alone unchanged', () => {
    assert.strictEqual(
      deduplicateClasses('rounded-lg flex'),
      'flex rounded-lg',
    );
  });

  await t.test('rounded (default) + rounded-t → rounded (override all)', () => {
    assert.strictEqual(deduplicateClasses('rounded rounded-t'), 'rounded');
  });

  await t.test('does not match border-gray-200', () => {
    assert.ok(
      !deduplicateClasses('rounded-lg border-gray-200').includes(
        'rounded-lg border-gray-200',
      ) ||
        deduplicateClasses('rounded-lg border-gray-200') ===
          'rounded-lg border-gray-200',
    );
  });
});

test('deduplicateClasses - no-op cases', async (t: TestContext) => {
  await t.test('non-conflicting classes unchanged', () => {
    const cls = 'border border-gray-200 shadow-sm';
    assert.strictEqual(deduplicateClasses(cls), cls);
  });

  await t.test('p and m together preserved independently', () => {
    const result = deduplicateClasses('p-4 m-4');
    assert.ok(result.includes('p-4'));
    assert.ok(result.includes('m-4'));
  });
});

test('deduplicateClasses - responsive cascade collapse', async (t: TestContext) => {
  await t.test('base redundant when sm matches', () => {
    assert.strictEqual(deduplicateClasses('p-4 sm:p-4'), 'p-4');
  });

  await t.test('md redundant when matches sm', () => {
    assert.strictEqual(deduplicateClasses('sm:p-6 md:p-6'), 'sm:p-6');
  });

  await t.test('md removed, lg kept when value changes', () => {
    assert.strictEqual(
      deduplicateClasses('sm:p-6 md:p-6 lg:p-8'),
      'sm:p-6 lg:p-8',
    );
  });

  await t.test('all same responsive breakpoints → keep smallest', () => {
    assert.strictEqual(deduplicateClasses('sm:p-4 md:p-4 lg:p-4'), 'sm:p-4');
  });

  await t.test('non-redundant responsive classes unchanged', () => {
    const cls = 'sm:p-4 md:p-6';
    assert.strictEqual(deduplicateClasses(cls), cls);
  });

  await t.test('works with text utility', () => {
    assert.strictEqual(
      deduplicateClasses('sm:text-sm md:text-sm'),
      'sm:text-sm',
    );
    assert.strictEqual(
      deduplicateClasses('sm:text-sm md:text-lg'),
      'sm:text-sm md:text-lg',
    );
  });

  await t.test('works with width utility', () => {
    assert.strictEqual(deduplicateClasses('sm:w-full md:w-full'), 'sm:w-full');
  });

  await t.test('nested state variants not collapsed', () => {
    const cls = 'sm:hover:p-4 md:hover:p-4';
    assert.strictEqual(deduplicateClasses(cls), cls);
  });

  await t.test('xl and 2xl cascade correctly', () => {
    assert.strictEqual(
      deduplicateClasses('lg:gap-4 xl:gap-4 2xl:gap-4'),
      'lg:gap-4',
    );
  });

  await t.test('non-responsive classes unaffected', () => {
    assert.strictEqual(
      deduplicateClasses('flex p-4 sm:text-lg md:text-lg'),
      'flex p-4 sm:text-lg',
    );
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
    const content = '<div className="flex items-center text-sm">x</div>';
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
