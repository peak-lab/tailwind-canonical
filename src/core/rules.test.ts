import assert from 'node:assert';
import { type TestContext, test } from 'node:test';
import { type Config, suggestCanonical } from './rules.js';

test('suggestCanonical - text sizes', async (t: TestContext) => {
  await t.test('text-[12px] maps to text-xs', () => {
    const result = suggestCanonical('text-[12px]');
    assert.deepEqual(result, {
      original: 'text-[12px]',
      canonical: 'text-xs',
      isCustomToken: false,
    });
  });

  await t.test(
    'text-[11px] without custom tokens maps to text-2xs (custom)',
    () => {
      const result = suggestCanonical('text-[11px]');
      assert.deepEqual(result, {
        original: 'text-[11px]',
        canonical: 'text-2xs',
        isCustomToken: true,
      });
    },
  );

  await t.test(
    'text-[11px] with custom text tokens maps to custom token',
    () => {
      const config: Config = { customTextTokens: { 11: '2xs' } };
      const result = suggestCanonical('text-[11px]', config);
      assert.deepEqual(result, {
        original: 'text-[11px]',
        canonical: 'text-2xs',
        isCustomToken: true,
      });
    },
  );

  await t.test('text-[14px] maps to text-sm', () => {
    const result = suggestCanonical('text-[14px]');
    assert.deepEqual(result, {
      original: 'text-[14px]',
      canonical: 'text-sm',
      isCustomToken: false,
    });
  });

  await t.test('text-[18px] maps to text-lg', () => {
    const result = suggestCanonical('text-[18px]');
    assert.deepEqual(result, {
      original: 'text-[18px]',
      canonical: 'text-lg',
      isCustomToken: false,
    });
  });

  await t.test('text-[9px] maps to text-3xs (custom)', () => {
    const result = suggestCanonical('text-[9px]');
    assert.deepEqual(result, {
      original: 'text-[9px]',
      canonical: 'text-3xs',
      isCustomToken: true,
    });
  });
});

test('suggestCanonical - spacing (divisible by 4)', async (t: TestContext) => {
  await t.test('h-[64px] maps to h-16', () => {
    const result = suggestCanonical('h-[64px]');
    assert.deepEqual(result, {
      original: 'h-[64px]',
      canonical: 'h-16',
      isCustomToken: false,
    });
  });

  await t.test('h-[22px] returns null (not divisible by 4)', () => {
    const result = suggestCanonical('h-[22px]');
    assert.strictEqual(result, null);
  });

  await t.test('w-[224px] maps to w-56', () => {
    const result = suggestCanonical('w-[224px]');
    assert.deepEqual(result, {
      original: 'w-[224px]',
      canonical: 'w-56',
      isCustomToken: false,
    });
  });

  await t.test('min-h-[56px] maps to min-h-14', () => {
    const result = suggestCanonical('min-h-[56px]');
    assert.deepEqual(result, {
      original: 'min-h-[56px]',
      canonical: 'min-h-14',
      isCustomToken: false,
    });
  });

  await t.test('max-w-[280px] maps to max-w-70', () => {
    const result = suggestCanonical('max-w-[280px]');
    assert.deepEqual(result, {
      original: 'max-w-[280px]',
      canonical: 'max-w-70',
      isCustomToken: false,
    });
  });

  await t.test('p-[16px] maps to p-4', () => {
    const result = suggestCanonical('p-[16px]');
    assert.deepEqual(result, {
      original: 'p-[16px]',
      canonical: 'p-4',
      isCustomToken: false,
    });
  });

  await t.test('px-[8px] maps to px-2', () => {
    const result = suggestCanonical('px-[8px]');
    assert.deepEqual(result, {
      original: 'px-[8px]',
      canonical: 'px-2',
      isCustomToken: false,
    });
  });

  await t.test('px-[7px] returns null (not divisible by 4)', () => {
    const result = suggestCanonical('px-[7px]');
    assert.strictEqual(result, null);
  });

  await t.test('m-[32px] maps to m-8', () => {
    const result = suggestCanonical('m-[32px]');
    assert.deepEqual(result, {
      original: 'm-[32px]',
      canonical: 'm-8',
      isCustomToken: false,
    });
  });

  await t.test('gap-[12px] maps to gap-3 (divisible by 4)', () => {
    const result = suggestCanonical('gap-[12px]');
    assert.deepEqual(result, {
      original: 'gap-[12px]',
      canonical: 'gap-3',
      isCustomToken: false,
    });
  });

  await t.test('gap-[16px] maps to gap-4', () => {
    const result = suggestCanonical('gap-[16px]');
    assert.deepEqual(result, {
      original: 'gap-[16px]',
      canonical: 'gap-4',
      isCustomToken: false,
    });
  });
});

test('suggestCanonical - spacing with custom tokens', async (t: TestContext) => {
  await t.test('custom spacing token takes priority', () => {
    const config: Config = { customSpacingTokens: { 7: 'custom' } };
    const result = suggestCanonical('px-[7px]', config);
    assert.deepEqual(result, {
      original: 'px-[7px]',
      canonical: 'px-custom',
      isCustomToken: true,
    });
  });

  await t.test('multiple custom spacing tokens', () => {
    const config: Config = {
      customSpacingTokens: { 5: 'custom-sm', 10: 'custom-md' },
    };
    const result = suggestCanonical('m-[10px]', config);
    assert.deepEqual(result, {
      original: 'm-[10px]',
      canonical: 'm-custom-md',
      isCustomToken: true,
    });
  });
});

test('suggestCanonical - rounded values', async (t: TestContext) => {
  await t.test('rounded-[8px] maps to rounded-lg', () => {
    const result = suggestCanonical('rounded-[8px]');
    assert.deepEqual(result, {
      original: 'rounded-[8px]',
      canonical: 'rounded-lg',
      isCustomToken: false,
    });
  });

  await t.test('rounded-[4px] maps to rounded-sm', () => {
    const result = suggestCanonical('rounded-[4px]');
    assert.deepEqual(result, {
      original: 'rounded-[4px]',
      canonical: 'rounded-sm',
      isCustomToken: false,
    });
  });

  await t.test('rounded-[6px] maps to rounded-md', () => {
    const result = suggestCanonical('rounded-[6px]');
    assert.deepEqual(result, {
      original: 'rounded-[6px]',
      canonical: 'rounded-md',
      isCustomToken: false,
    });
  });

  await t.test('rounded-[12px] maps to rounded-xl', () => {
    const result = suggestCanonical('rounded-[12px]');
    assert.deepEqual(result, {
      original: 'rounded-[12px]',
      canonical: 'rounded-xl',
      isCustomToken: false,
    });
  });

  await t.test('rounded-[16px] maps to rounded-2xl', () => {
    const result = suggestCanonical('rounded-[16px]');
    assert.deepEqual(result, {
      original: 'rounded-[16px]',
      canonical: 'rounded-2xl',
      isCustomToken: false,
    });
  });

  await t.test('rounded-[3px] returns null (no matching token)', () => {
    const result = suggestCanonical('rounded-[3px]');
    assert.strictEqual(result, null);
  });

  await t.test('rounded-tl-[8px] maps to rounded-tl-lg', () => {
    const result = suggestCanonical('rounded-tl-[8px]');
    assert.deepEqual(result, {
      original: 'rounded-tl-[8px]',
      canonical: 'rounded-tl-lg',
      isCustomToken: false,
    });
  });

  await t.test('rounded-br-[12px] maps to rounded-br-xl', () => {
    const result = suggestCanonical('rounded-br-[12px]');
    assert.deepEqual(result, {
      original: 'rounded-br-[12px]',
      canonical: 'rounded-br-xl',
      isCustomToken: false,
    });
  });
});

test('suggestCanonical - non-arbitrary classes', async (t: TestContext) => {
  await t.test('text-primary (no arbitrary) returns null', () => {
    const result = suggestCanonical('text-primary');
    assert.strictEqual(result, null);
  });

  await t.test('flex returns null', () => {
    const result = suggestCanonical('flex');
    assert.strictEqual(result, null);
  });

  await t.test('text-xs (built-in) returns null', () => {
    const result = suggestCanonical('text-xs');
    assert.strictEqual(result, null);
  });

  await t.test('h-16 (built-in) returns null', () => {
    const result = suggestCanonical('h-16');
    assert.strictEqual(result, null);
  });
});

test('suggestCanonical - edge cases', async (t: TestContext) => {
  await t.test('empty string returns null', () => {
    const result = suggestCanonical('');
    assert.strictEqual(result, null);
  });

  await t.test('text-[0px] returns null (no matching token)', () => {
    const result = suggestCanonical('text-[0px]');
    assert.strictEqual(result, null);
  });

  await t.test('h-[0px] maps to h-0 (divisible by 4)', () => {
    const result = suggestCanonical('h-[0px]');
    assert.deepEqual(result, {
      original: 'h-[0px]',
      canonical: 'h-0',
      isCustomToken: false,
    });
  });

  await t.test('very large spacing value h-[1000px] maps to h-250', () => {
    const result = suggestCanonical('h-[1000px]');
    assert.deepEqual(result, {
      original: 'h-[1000px]',
      canonical: 'h-250',
      isCustomToken: false,
    });
  });

  await t.test('top/left/right/bottom spacing properties work', () => {
    const result = suggestCanonical('top-[16px]');
    assert.deepEqual(result, {
      original: 'top-[16px]',
      canonical: 'top-4',
      isCustomToken: false,
    });
  });

  await t.test('translate-x spacing property works', () => {
    const result = suggestCanonical('translate-x-[20px]');
    assert.deepEqual(result, {
      original: 'translate-x-[20px]',
      canonical: 'translate-x-5',
      isCustomToken: false,
    });
  });

  await t.test('space-y property works', () => {
    const result = suggestCanonical('space-y-[8px]');
    assert.deepEqual(result, {
      original: 'space-y-[8px]',
      canonical: 'space-y-2',
      isCustomToken: false,
    });
  });
});
