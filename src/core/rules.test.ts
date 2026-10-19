import assert from 'node:assert';
import { type TestContext, test } from 'node:test';
import { type Config, suggestCanonical } from './rules.js';

test('suggestCanonical - ignorePatterns', async (t: TestContext) => {
  await t.test('returns null for a class matching an ignore pattern', () => {
    const config: Config = { ignorePatterns: [/^text-/] };
    assert.strictEqual(suggestCanonical('text-[12px]', config), null);
  });

  await t.test('still suggests for non-matching classes', () => {
    const config: Config = { ignorePatterns: [/^text-/] };
    assert.strictEqual(suggestCanonical('h-[64px]', config)?.canonical, 'h-16');
  });

  await t.test('global-flag patterns are deterministic across calls', () => {
    const config: Config = { ignorePatterns: [/text/g] };
    assert.strictEqual(suggestCanonical('text-[12px]', config), null);
    assert.strictEqual(suggestCanonical('text-[12px]', config), null);
  });
});

test('suggestCanonical - text sizes', async (t: TestContext) => {
  await t.test('text-[12px] maps to text-xs', () => {
    const result = suggestCanonical('text-[12px]');
    assert.deepEqual(result, {
      original: 'text-[12px]',
      canonical: 'text-xs',
      isCustomToken: false,
    });
  });

  await t.test('text-[11px] without custom tokens returns null', () => {
    assert.strictEqual(suggestCanonical('text-[11px]'), null);
  });

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

  await t.test('text-[96px] maps to text-8xl', () => {
    const result = suggestCanonical('text-[96px]');
    assert.deepEqual(result, {
      original: 'text-[96px]',
      canonical: 'text-8xl',
      isCustomToken: false,
    });
  });

  await t.test('text-[128px] maps to text-9xl', () => {
    const result = suggestCanonical('text-[128px]');
    assert.deepEqual(result, {
      original: 'text-[128px]',
      canonical: 'text-9xl',
      isCustomToken: false,
    });
  });

  await t.test('text-[13px] returns null (no canonical token)', () => {
    assert.strictEqual(suggestCanonical('text-[13px]'), null);
  });

  await t.test('text-[13px] honors a custom text token', () => {
    const result = suggestCanonical('text-[13px]', {
      customTextTokens: { 13: 'sm-plus' },
    });
    assert.deepEqual(result, {
      original: 'text-[13px]',
      canonical: 'text-sm-plus',
      isCustomToken: true,
    });
  });

  await t.test('text-[9px] without custom tokens returns null', () => {
    assert.strictEqual(suggestCanonical('text-[9px]'), null);
  });

  await t.test('text-[9px] honors a custom text token', () => {
    const result = suggestCanonical('text-[9px]', {
      customTextTokens: { 9: '3xs' },
    });
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

test('suggestCanonical - rem values', async (t: TestContext) => {
  await t.test('text-[0.75rem] maps to text-xs (0.75*16=12px)', () => {
    assert.deepEqual(suggestCanonical('text-[0.75rem]'), {
      original: 'text-[0.75rem]',
      canonical: 'text-xs',
      isCustomToken: false,
    });
  });

  await t.test('text-[0.875rem] maps to text-sm (0.875*16=14px)', () => {
    assert.deepEqual(suggestCanonical('text-[0.875rem]'), {
      original: 'text-[0.875rem]',
      canonical: 'text-sm',
      isCustomToken: false,
    });
  });

  await t.test('text-[1rem] maps to text-base (1*16=16px)', () => {
    assert.deepEqual(suggestCanonical('text-[1rem]'), {
      original: 'text-[1rem]',
      canonical: 'text-base',
      isCustomToken: false,
    });
  });

  await t.test('h-[4rem] maps to h-16 (4*16=64px, ÷4=16)', () => {
    assert.deepEqual(suggestCanonical('h-[4rem]'), {
      original: 'h-[4rem]',
      canonical: 'h-16',
      isCustomToken: false,
    });
  });

  await t.test('w-[2rem] maps to w-8 (2*16=32px, ÷4=8)', () => {
    assert.deepEqual(suggestCanonical('w-[2rem]'), {
      original: 'w-[2rem]',
      canonical: 'w-8',
      isCustomToken: false,
    });
  });

  await t.test('p-[1rem] maps to p-4 (1*16=16px, ÷4=4)', () => {
    assert.deepEqual(suggestCanonical('p-[1rem]'), {
      original: 'p-[1rem]',
      canonical: 'p-4',
      isCustomToken: false,
    });
  });

  await t.test('h-[1.5rem] maps to h-6 (1.5*16=24px, ÷4=6)', () => {
    assert.deepEqual(suggestCanonical('h-[1.5rem]'), {
      original: 'h-[1.5rem]',
      canonical: 'h-6',
      isCustomToken: false,
    });
  });

  await t.test('h-[0.375rem] returns null (0.375*16=6px, not ÷4)', () => {
    assert.strictEqual(suggestCanonical('h-[0.375rem]'), null);
  });

  await t.test(
    'text-[0.5rem] returns null (0.5*16=8px, no built-in text-3xs)',
    () => {
      const result = suggestCanonical('text-[0.5rem]');
      assert.ok(result === null || result.isCustomToken === true);
    },
  );
});

test('suggestCanonical - percentage values', async (t: TestContext) => {
  await t.test('w-[50%] maps to w-1/2', () => {
    assert.deepEqual(suggestCanonical('w-[50%]'), {
      original: 'w-[50%]',
      canonical: 'w-1/2',
      isCustomToken: false,
    });
  });

  await t.test('w-[33.333333%] maps to w-1/3', () => {
    assert.deepEqual(suggestCanonical('w-[33.333333%]'), {
      original: 'w-[33.333333%]',
      canonical: 'w-1/3',
      isCustomToken: false,
    });
  });

  await t.test('w-[66.666667%] maps to w-2/3', () => {
    assert.deepEqual(suggestCanonical('w-[66.666667%]'), {
      original: 'w-[66.666667%]',
      canonical: 'w-2/3',
      isCustomToken: false,
    });
  });

  await t.test('w-[25%] maps to w-1/4', () => {
    assert.deepEqual(suggestCanonical('w-[25%]'), {
      original: 'w-[25%]',
      canonical: 'w-1/4',
      isCustomToken: false,
    });
  });

  await t.test('w-[75%] maps to w-3/4', () => {
    assert.deepEqual(suggestCanonical('w-[75%]'), {
      original: 'w-[75%]',
      canonical: 'w-3/4',
      isCustomToken: false,
    });
  });

  await t.test('h-[50%] maps to h-1/2', () => {
    assert.deepEqual(suggestCanonical('h-[50%]'), {
      original: 'h-[50%]',
      canonical: 'h-1/2',
      isCustomToken: false,
    });
  });

  await t.test('max-w-[50%] maps to max-w-1/2', () => {
    assert.deepEqual(suggestCanonical('max-w-[50%]'), {
      original: 'max-w-[50%]',
      canonical: 'max-w-1/2',
      isCustomToken: false,
    });
  });

  await t.test('w-[33%] returns null (not in fraction map)', () => {
    assert.strictEqual(suggestCanonical('w-[33%]'), null);
  });

  await t.test(
    'p-[50%] returns null (padding has no fraction variants)',
    () => {
      assert.strictEqual(suggestCanonical('p-[50%]'), null);
    },
  );

  await t.test('w-[20%] maps to w-1/5', () => {
    assert.deepEqual(suggestCanonical('w-[20%]'), {
      original: 'w-[20%]',
      canonical: 'w-1/5',
      isCustomToken: false,
    });
  });
});

test('suggestCanonical - opacity values', async (t: TestContext) => {
  await t.test('opacity-[0.5] maps to opacity-50', () => {
    assert.deepEqual(suggestCanonical('opacity-[0.5]'), {
      original: 'opacity-[0.5]',
      canonical: 'opacity-50',
      isCustomToken: false,
    });
  });

  await t.test('opacity-[0.75] maps to opacity-75', () => {
    assert.deepEqual(suggestCanonical('opacity-[0.75]'), {
      original: 'opacity-[0.75]',
      canonical: 'opacity-75',
      isCustomToken: false,
    });
  });

  await t.test('opacity-[0] maps to opacity-0', () => {
    assert.deepEqual(suggestCanonical('opacity-[0]'), {
      original: 'opacity-[0]',
      canonical: 'opacity-0',
      isCustomToken: false,
    });
  });

  await t.test('opacity-[1] maps to opacity-100', () => {
    assert.deepEqual(suggestCanonical('opacity-[1]'), {
      original: 'opacity-[1]',
      canonical: 'opacity-100',
      isCustomToken: false,
    });
  });

  await t.test('opacity-[0.25] maps to opacity-25', () => {
    assert.deepEqual(suggestCanonical('opacity-[0.25]'), {
      original: 'opacity-[0.25]',
      canonical: 'opacity-25',
      isCustomToken: false,
    });
  });

  await t.test('opacity-[0.33] returns null (33 not in opacity scale)', () => {
    assert.strictEqual(suggestCanonical('opacity-[0.33]'), null);
  });

  await t.test('opacity-[0.05] maps to opacity-5', () => {
    assert.deepEqual(suggestCanonical('opacity-[0.05]'), {
      original: 'opacity-[0.05]',
      canonical: 'opacity-5',
      isCustomToken: false,
    });
  });

  await t.test(
    'opacity-[0.049] returns null rather than rounding to opacity-5',
    () => {
      assert.strictEqual(suggestCanonical('opacity-[0.049]'), null);
    },
  );

  await t.test(
    'opacity precision artifacts preserve an exact scale value',
    () => {
      assert.deepEqual(suggestCanonical('opacity-[0.7000000000000001]'), {
        original: 'opacity-[0.7000000000000001]',
        canonical: 'opacity-70',
        isCustomToken: false,
      });
    },
  );

  await t.test('opacity-[50] returns null (>1 is not a fraction)', () => {
    assert.strictEqual(suggestCanonical('opacity-[50]'), null);
  });

  await t.test('opacity-[100] returns null (>1 clamps, not 100%)', () => {
    assert.strictEqual(suggestCanonical('opacity-[100]'), null);
  });
});

test('suggestCanonical - 1px spacing and width utilities', async (t: TestContext) => {
  const cases: [string, string | null, Config?][] = [
    ['p-[1px]', 'p-px'],
    ['m-[1px]', 'm-px'],
    ['gap-[1px]', 'gap-px'],
    ['px-[1px]', 'px-px'],
    ['w-[1px]', 'w-px'],
    ['p-[0.0625rem]', 'p-px'],
    ['-mt-[1px]', '-mt-px'],
    ['mt-[-1px]', '-mt-px'],
    ['p-[1px]', 'p-px', { tailwindVersion: 3 }],
    ['size-[1px]', 'size-px'],
    ['size-[1px]', null, { tailwindVersion: 3 }],
    ['min-w-[1px]', null, { tailwindVersion: 3 }],
    ['p-[1px]', 'p-0.25', { customSpacingTokens: { 1: '0.25' } }],
    ['border-[1px]', 'border'],
    ['border-t-[1px]', 'border-t'],
    ['border-x-[1px]', 'border-x'],
    ['border-s-[1px]', 'border-s'],
    ['border-[0px]', 'border-0'],
    ['border-[2px]', 'border-2'],
    ['border-[4px]', 'border-4'],
    ['border-[8px]', 'border-8'],
    ['border-b-[2px]', 'border-b-2'],
    ['border-[3px]', null],
    ['border-[#fff]', null],
    ['border-[1px]', 'border', { tailwindVersion: 3 }],
    ['hover:border-[1px]', 'hover:border'],
    ['-border-[1px]', null],
    ['divide-x-[1px]', 'divide-x'],
    ['divide-y-[2px]', 'divide-y-2'],
    ['ring-[1px]', 'ring-1'],
    ['ring-[2px]', 'ring-2'],
    ['ring-[0px]', 'ring-0'],
    ['ring-[1px]', 'ring-1', { tailwindVersion: 3 }],
    ['ring-[3px]', null],
    ['outline-[2px]', 'outline-2'],
    ['outline-[1px]', 'outline-1'],
    ['outline-[1px]', 'outline-1', { tailwindVersion: 3 }],
    ['outline-[5px]', null],
  ];

  for (const [cls, expected, config] of cases) {
    const label = config ? `${cls} ${JSON.stringify(config)}` : cls;
    await t.test(`${label} -> ${expected}`, () => {
      assert.strictEqual(
        suggestCanonical(cls, config)?.canonical ?? null,
        expected,
      );
    });
  }
});

test('suggestCanonical - tailwindVersion: 3', async (t: TestContext) => {
  const v3 = { tailwindVersion: 3 } as const;

  await t.test('drops steps outside the v3 discrete scale', () => {
    // p-13 is calc(var(--spacing) * 13) in v4 and generates no CSS in v3.
    assert.deepEqual(suggestCanonical('p-[52px]'), {
      original: 'p-[52px]',
      canonical: 'p-13',
      isCustomToken: false,
    });
    assert.strictEqual(suggestCanonical('p-[52px]', v3), null);
    assert.strictEqual(suggestCanonical('p-[60px]', v3), null);
    assert.strictEqual(suggestCanonical('p-[3.25rem]', v3), null);
  });

  await t.test('keeps steps the v3 scale does ship', () => {
    assert.deepEqual(suggestCanonical('p-[16px]', v3), {
      original: 'p-[16px]',
      canonical: 'p-4',
      isCustomToken: false,
    });
    assert.strictEqual(suggestCanonical('gap-[8px]', v3)?.canonical, 'gap-2');
    assert.strictEqual(suggestCanonical('m-[384px]', v3)?.canonical, 'm-96');
  });

  await t.test('drops utilities with no numeric scale in v3.3', () => {
    for (const cls of [
      'max-w-[16px]',
      'min-w-[16px]',
      'min-h-[16px]',
      'size-[16px]',
    ]) {
      assert.strictEqual(suggestCanonical(cls, v3), null, cls);
    }
    // max-h is the one that does ship a spacing scale in v3.3
    assert.strictEqual(
      suggestCanonical('max-h-[16px]', v3)?.canonical,
      'max-h-4',
    );
  });

  await t.test('drops fractions on utilities that have none in v3.3', () => {
    for (const cls of [
      'max-w-[50%]',
      'min-w-[50%]',
      'min-h-[50%]',
      'max-h-[50%]',
    ]) {
      assert.strictEqual(suggestCanonical(cls, v3), null, cls);
    }
    assert.strictEqual(suggestCanonical('w-[50%]', v3)?.canonical, 'w-1/2');
    assert.strictEqual(suggestCanonical('top-[50%]', v3)?.canonical, 'top-1/2');
  });

  await t.test('gates fractions per utility, not per family', () => {
    // v3.3 gives inset/translate only halves, thirds and quarters; the
    // fifths, sixths and twelfths below compile to nothing there.
    assert.strictEqual(suggestCanonical('top-[20%]', v3), null);
    assert.strictEqual(suggestCanonical('translate-x-[40%]', v3), null);
    assert.strictEqual(suggestCanonical('inset-[16.666667%]', v3), null);
    assert.strictEqual(suggestCanonical('h-[8.333333%]', v3), null);
    // ...while w carries the full set and h stops at sixths
    assert.strictEqual(
      suggestCanonical('w-[8.333333%]', v3)?.canonical,
      'w-1/12',
    );
    assert.strictEqual(suggestCanonical('h-[20%]', v3)?.canonical, 'h-1/5');
    assert.strictEqual(suggestCanonical('top-[25%]', v3)?.canonical, 'top-1/4');
  });

  await t.test('keeps the zero step on utilities that only ship zero', () => {
    for (const prefix of ['min-w', 'max-w', 'min-h']) {
      assert.strictEqual(
        suggestCanonical(`${prefix}-[0px]`, v3)?.canonical,
        `${prefix}-0`,
        prefix,
      );
      assert.strictEqual(
        suggestCanonical(`${prefix}-[16px]`, v3),
        null,
        prefix,
      );
    }
    // size has no numeric scale at all in v3.3, not even zero
    assert.strictEqual(suggestCanonical('size-[0px]', v3), null);
  });

  await t.test('leaves dimensions that are identical in both majors', () => {
    assert.strictEqual(
      suggestCanonical('rounded-[8px]', v3)?.canonical,
      'rounded-lg',
    );
    assert.strictEqual(
      suggestCanonical('opacity-[0.5]', v3)?.canonical,
      'opacity-50',
    );
    assert.strictEqual(
      suggestCanonical('text-[12px]', v3)?.canonical,
      'text-xs',
    );
  });

  await t.test('custom spacing tokens stay the user decision', () => {
    assert.deepEqual(
      suggestCanonical('p-[52px]', {
        ...v3,
        customSpacingTokens: { 52: 'gutter' },
      }),
      { original: 'p-[52px]', canonical: 'p-gutter', isCustomToken: true },
    );
  });

  await t.test('tailwindVersion: 4 is the default behaviour', () => {
    for (const cls of [
      'p-[52px]',
      'max-w-[16px]',
      'size-[16px]',
      'max-w-[50%]',
    ]) {
      assert.deepEqual(
        suggestCanonical(cls, { tailwindVersion: 4 }),
        suggestCanonical(cls),
        cls,
      );
    }
  });
});

test('suggestCanonical - variants, important and sign', async (t: TestContext) => {
  const cases: [string, string | null, Config?][] = [
    ['hover:p-[16px]', 'hover:p-4'],
    ['md:hover:w-[50%]', 'md:hover:w-1/2'],
    ['[&:hover]:p-[16px]', '[&:hover]:p-4'],
    ['data-[state=open]:h-[64px]', 'data-[state=open]:h-16'],
    ['supports-[display:grid]:gap-[8px]', 'supports-[display:grid]:gap-2'],
    ['group-hover/item:text-[12px]', 'group-hover/item:text-xs'],
    ['!p-[16px]', '!p-4'],
    ['md:!p-[16px]', 'md:!p-4'],
    ['p-[16px]!', 'p-4!'],
    ['-mt-[8px]', '-mt-2'],
    ['mt-[-8px]', '-mt-2'],
    ['md:-translate-x-[50%]', 'md:-translate-x-1/2'],
    ['-top-[1rem]', '-top-4'],
    ['-mt-[-8px]', 'mt-2'],
    ['-mt-[0px]', 'mt-0'],
    ['-mt-[14px]', '-mt-3.5', { customSpacingTokens: { 14: '3.5' } }],
    ['-p-[16px]', null],
    ['p-[-16px]', null],
    ['-w-[50%]', null],
    ['-text-[12px]', null],
    ['-opacity-[0.5]', null],
    ['hover:p-[13px]', null],
    ['hover:p-4', null],
    ['md:text-[12px]', null, { ignorePatterns: [/^text-/] }],
  ];
  for (const [input, expected, config] of cases) {
    await t.test(`${input} → ${expected}`, () => {
      assert.strictEqual(
        suggestCanonical(input, config)?.canonical ?? null,
        expected,
      );
    });
  }

  await t.test('original keeps the full class', () => {
    assert.deepEqual(suggestCanonical('md:-mt-[8px]'), {
      original: 'md:-mt-[8px]',
      canonical: 'md:-mt-2',
      isCustomToken: false,
    });
  });

  await t.test('v3 scale gating still applies under a variant', () => {
    const config: Config = { tailwindVersion: 3 };
    assert.strictEqual(suggestCanonical('hover:size-[32px]', config), null);
  });
});

test('suggestCanonical - transitions and transforms', async (t: TestContext) => {
  const v3: Config = { tailwindVersion: 3 };
  const cases: [string, string | null, Config?][] = [
    ['duration-[200ms]', 'duration-200'],
    ['delay-[150ms]', 'delay-150'],
    ['duration-[0.2s]', 'duration-200'],
    ['delay-[1.5s]', 'delay-1500'],
    ['duration-[250ms]', 'duration-250'],
    ['duration-[250ms]', null, v3],
    ['duration-[0.3s]', 'duration-300', v3],
    ['delay-[1.5s]', null, v3],
    ['duration-[0.25ms]', null],
    ['duration-[200]', null],
    ['scale-[1.05]', 'scale-105'],
    ['scale-[0.95]', 'scale-95'],
    ['scale-[1.1]', 'scale-110'],
    ['scale-[105%]', 'scale-105'],
    ['scale-x-[1.5]', 'scale-x-150'],
    ['scale-y-[0.5]', 'scale-y-50'],
    ['scale-[1.15]', 'scale-115'],
    ['scale-[1.15]', null, v3],
    ['scale-[1.05]', 'scale-105', v3],
    ['scale-[1.055]', null],
    ['rotate-[45deg]', 'rotate-45'],
    ['rotate-[30deg]', 'rotate-30'],
    ['rotate-[30deg]', null, v3],
    ['rotate-[90deg]', 'rotate-90', v3],
    ['rotate-[22.5deg]', null],
    ['rotate-[0.5turn]', null],
    ['blur-[4px]', 'blur-xs'],
    ['blur-[8px]', 'blur-sm'],
    ['blur-[0.75rem]', 'blur-md'],
    ['blur-[64px]', 'blur-3xl'],
    ['blur-[4px]', 'blur-sm', v3],
    ['blur-[8px]', 'blur', v3],
    ['blur-[12px]', 'blur-md', v3],
    ['blur-[6px]', null],
    ['-rotate-[45deg]', '-rotate-45'],
    ['rotate-[-45deg]', '-rotate-45'],
    ['-scale-[1.05]', '-scale-105'],
    ['-scale-x-[0.5]', '-scale-x-50'],
    ['-rotate-[0deg]', 'rotate-0'],
    ['-duration-[200ms]', null],
    ['-blur-[4px]', null],
    ['hover:scale-[1.05]', 'hover:scale-105'],
    ['md:!rotate-[45deg]', 'md:!rotate-45'],
  ];
  for (const [input, expected, config] of cases) {
    const label = config?.tailwindVersion === 3 ? ' (v3)' : '';
    await t.test(`${input} → ${expected}${label}`, () => {
      assert.strictEqual(
        suggestCanonical(input, config)?.canonical ?? null,
        expected,
      );
    });
  }
});

test('suggestCanonical - unitless scales', async (t: TestContext) => {
  const v3: Config = { tailwindVersion: 3 };
  const cases: Array<[string, string | null, string | null]> = [
    ['z-[0]', 'z-0', 'z-0'],
    ['z-[10]', 'z-10', 'z-10'],
    ['z-[50]', 'z-50', 'z-50'],
    ['z-[15]', 'z-15', null],
    ['-z-[10]', '-z-10', '-z-10'],
    ['z-[-10]', '-z-10', '-z-10'],
    ['md:!z-[20]', 'md:!z-20', 'md:!z-20'],
    ['font-[100]', 'font-thin', 'font-thin'],
    ['font-[400]', 'font-normal', 'font-normal'],
    ['font-[700]', 'font-bold', 'font-bold'],
    ['font-[900]', 'font-black', 'font-black'],
    ['font-[450]', null, null],
    ['-font-[700]', null, null],
    ['leading-[24px]', 'leading-6', 'leading-6'],
    ['leading-[1.5rem]', 'leading-6', 'leading-6'],
    ['leading-[44px]', 'leading-11', null],
    ['leading-[8px]', 'leading-2', null],
    ['leading-[22px]', null, null],
    ['leading-[1]', 'leading-none', 'leading-none'],
    ['leading-[1.25]', 'leading-tight', 'leading-tight'],
    ['leading-[1.375]', 'leading-snug', 'leading-snug'],
    ['leading-[1.5]', 'leading-normal', 'leading-normal'],
    ['leading-[1.50]', 'leading-normal', 'leading-normal'],
    ['leading-[1.625]', 'leading-relaxed', 'leading-relaxed'],
    ['leading-[2]', 'leading-loose', 'leading-loose'],
    ['leading-[1.4]', null, null],
    ['opacity-[.5]', 'opacity-50', 'opacity-50'],
    ['opacity-[.33]', null, null],
    ['order-[1]', 'order-1', 'order-1'],
    ['order-[12]', 'order-12', 'order-12'],
    ['order-[13]', 'order-13', null],
    ['order-[0]', 'order-none', 'order-none'],
    ['-order-[1]', '-order-1', '-order-1'],
    ['-order-[0]', 'order-none', 'order-none'],
    ['grow-[0]', 'grow-0', 'grow-0'],
    ['grow-[1]', 'grow', 'grow'],
    ['grow-[2]', 'grow-2', null],
    ['shrink-[0]', 'shrink-0', 'shrink-0'],
    ['shrink-[1]', 'shrink', 'shrink'],
    ['-grow-[1]', null, null],
    ['line-clamp-[3]', 'line-clamp-3', 'line-clamp-3'],
    ['line-clamp-[7]', 'line-clamp-7', null],
    ['line-clamp-[0]', null, null],
    ['columns-[3]', 'columns-3', 'columns-3'],
    ['columns-[13]', 'columns-13', null],
    ['columns-[0]', null, null],
  ];
  for (const [input, v4Expected, v3Expected] of cases) {
    await t.test(`${input} → v4 ${v4Expected} / v3 ${v3Expected}`, () => {
      assert.strictEqual(
        suggestCanonical(input)?.canonical ?? null,
        v4Expected,
      );
      assert.strictEqual(
        suggestCanonical(input, v3)?.canonical ?? null,
        v3Expected,
      );
    });
  }

  await t.test('customSpacingTokens apply to leading', () => {
    assert.deepEqual(
      suggestCanonical('leading-[14px]', {
        customSpacingTokens: { 14: '3.5' },
      }),
      {
        original: 'leading-[14px]',
        canonical: 'leading-3.5',
        isCustomToken: true,
      },
    );
  });
});
