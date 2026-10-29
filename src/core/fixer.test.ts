import assert from 'node:assert';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixContent, fixFile } from './fixer.js';

test('fixFile', async (t) => {
  await t.test(
    'fixes multiple arbitrary classes and returns correct count',
    () => {
      const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
      const content = '<div className="size-[12px] h-[64px] flex">Hello</div>';

      try {
        writeFileSync(tempFile, content, 'utf8');

        const count = fixFile(tempFile);

        assert.strictEqual(count, 2, 'Should fix 2 classes');

        const fixed = readFileSync(tempFile, 'utf8');
        assert.strictEqual(
          fixed,
          '<div className="size-3 h-16 flex">Hello</div>',
          'Should replace size-[12px] with size-3 and h-[64px] with h-16',
        );
      } finally {
        unlinkSync(tempFile);
      }
    },
  );

  await t.test('handles double-quoted className attributes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className="size-[12px] w-[224px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, '<div className="size-3 w-56">Content</div>');
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles single-quoted className attributes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = "<div className='size-[20px] m-[32px]'>Content</div>";

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, "<div className='size-5 m-8'>Content</div>");
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles braced backtick-quoted className attributes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className={`size-[24px] px-[16px]`}>Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, '<div className={`size-6 px-4`}>Content</div>');
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('does not modify file if no replacements needed', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className="flex justify-center">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 0);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, content);
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('ignores classes that cannot be converted', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content =
      '<div className="size-[12px] px-[7px] h-[64px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2, 'Should only fix size-[12px] and h-[64px]');

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(
        fixed,
        '<div className="size-3 px-[7px] h-16">Content</div>',
      );
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles multiple className attributes in same file', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = `
      <div className="size-[12px]">First</div>
      <span className="h-[64px]">Second</span>
      <p className="w-[224px]">Third</p>
    `;

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 3);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.match(fixed, /className="size-3"/);
      assert.match(fixed, /className="h-16"/);
      assert.match(fixed, /className="w-56"/);
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('preserves whitespace and formatting', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content =
      '<div className="size-[12px]   h-[64px]   flex">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(
        fixed,
        '<div className="size-3   h-16   flex">Content</div>',
      );
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles rounded classes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className="rounded-[8px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 1);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, '<div className="rounded-lg">Content</div>');
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles corner-specific rounded classes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content =
      '<div className="rounded-tl-[12px] rounded-br-[4px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(
        fixed,
        '<div className="rounded-tl-xl rounded-br-sm">Content</div>',
      );
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('respects custom text tokens via config', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className="text-[11px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile, {
        allowTextSizeLineHeightChanges: true,
        customTextTokens: { 11: '2xs' },
      });

      assert.strictEqual(count, 1);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, '<div className="text-2xs">Content</div>');
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('respects custom spacing tokens via config', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className="px-[7px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile, { customSpacingTokens: { 7: 'custom' } });

      assert.strictEqual(count, 1);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, '<div className="px-custom">Content</div>');
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles complex JSX with mixed content', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = `
      export function Component() {
        return (
          <div className="size-[12px] p-[16px]">
            <h1 className="size-[24px]">Title</h1>
            <p className="h-[64px]">Paragraph</p>
          </div>
        )
      }
    `;

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 4);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.match(fixed, /className="size-3 p-4"/);
      assert.match(fixed, /className="size-6"/);
      assert.match(fixed, /className="h-16"/);
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles spacing properties with various prefixes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = `
      <div className="m-[16px] mt-[8px] mb-[12px] gap-[20px]">Content</div>
    `;

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      // All are divisible by 4: m-[16px]=m-4, mt-[8px]=mt-2, mb-[12px]=mb-3, gap-[20px]=gap-5
      assert.strictEqual(
        count,
        4,
        'Should fix all 4 spacing values (all divisible by 4)',
      );

      const fixed = readFileSync(tempFile, 'utf8');
      assert.match(fixed, /m-4/);
      assert.match(fixed, /mt-2/);
      assert.match(fixed, /mb-3/);
      assert.match(fixed, /gap-5/);
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('does not write file if count is 0', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className="flex">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      // Get original modification time
      const beforeTime = statSync(tempFile).mtimeMs;

      // Small delay to ensure time difference is measurable
      const now = Date.now();
      while (Date.now() - now < 10) {
        // busy wait
      }

      fixFile(tempFile);

      const afterStat = statSync(tempFile);

      // File modification time should be the same (or very close)
      assert.strictEqual(
        beforeTime,
        afterStat.mtimeMs,
        'File should not be rewritten if no changes made',
      );
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles newlines and indentation in className', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = `<div className="
      size-[12px]
      h-[64px]
      flex
    ">Content</div>`;

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.match(fixed, /size-3/);
      assert.match(fixed, /h-16/);
    } finally {
      unlinkSync(tempFile);
    }
  });
});

test('fixContent - rewrites variant, important and negative classes', () => {
  const { result, count } = fixContent(
    '<div className="hover:p-[16px] !m-[8px] -mt-[4px] md:w-[50%]" />',
  );
  assert.strictEqual(
    result,
    '<div className="hover:p-4 !m-2 -mt-1 md:w-1/2" />',
  );
  assert.strictEqual(count, 4);
});

test('fixContent - rewrites keyword values', () => {
  const { result, count } = fixContent(
    '<div className="w-[100%] h-[100vh] mx-[auto] aspect-[16/9] top-[0]" />',
  );
  assert.strictEqual(
    result,
    '<div className="w-full h-screen mx-auto aspect-video top-0" />',
  );
  assert.strictEqual(count, 5);
});

test('font sizes preserve line-height semantics by default while spacing still fixes', () => {
  const content =
    '<div className="text-[12px] sm:!text-[0.75rem] leading-6 p-[16px]" />';
  for (const config of [
    {},
    { allowTextSizeLineHeightChanges: false },
    { customTextTokens: { 12: 'tiny' } },
  ]) {
    assert.deepStrictEqual(fixContent(content, config), {
      result: content.replace('p-[16px]', 'p-4'),
      count: 1,
    });
  }
  assert.deepStrictEqual(
    fixContent(content, { allowTextSizeLineHeightChanges: true }),
    {
      result: '<div className="text-xs sm:!text-xs leading-6 p-4" />',
      count: 3,
    },
  );
});
