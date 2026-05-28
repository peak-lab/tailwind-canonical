import assert from 'node:assert';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixFile } from './fixer.js';

test('fixFile', async (t) => {
  await t.test(
    'fixes multiple arbitrary classes and returns correct count',
    () => {
      const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
      const content = '<div className="text-[12px] h-[64px] flex">Hello</div>';

      try {
        writeFileSync(tempFile, content, 'utf8');

        const count = fixFile(tempFile);

        assert.strictEqual(count, 2, 'Should fix 2 classes');

        const fixed = readFileSync(tempFile, 'utf8');
        assert.strictEqual(
          fixed,
          '<div className="text-xs h-16 flex">Hello</div>',
          'Should replace text-[12px] with text-xs and h-[64px] with h-16',
        );
      } finally {
        unlinkSync(tempFile);
      }
    },
  );

  await t.test('handles double-quoted className attributes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className="text-[12px] w-[224px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, '<div className="text-xs w-56">Content</div>');
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles single-quoted className attributes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = "<div className='text-[14px] m-[32px]'>Content</div>";

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, "<div className='text-sm m-8'>Content</div>");
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles backtick-quoted className attributes', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = '<div className={`text-[18px] px-[16px]`}>Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      // Backticks in curly braces are not matched by the fixer regex
      // The regex only matches className="..." className='...' className=`...`
      // not className={`...`}
      assert.strictEqual(count, 0);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(fixed, content);
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
      '<div className="text-[12px] px-[7px] h-[64px]">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2, 'Should only fix text-[12px] and h-[64px]');

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(
        fixed,
        '<div className="text-xs px-[7px] h-16">Content</div>',
      );
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('handles multiple className attributes in same file', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content = `
      <div className="text-[12px]">First</div>
      <span className="h-[64px]">Second</span>
      <p className="w-[224px]">Third</p>
    `;

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 3);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.match(fixed, /className="text-xs"/);
      assert.match(fixed, /className="h-16"/);
      assert.match(fixed, /className="w-56"/);
    } finally {
      unlinkSync(tempFile);
    }
  });

  await t.test('preserves whitespace and formatting', () => {
    const tempFile = join(tmpdir(), `test-${Date.now()}.tsx`);
    const content =
      '<div className="text-[12px]   h-[64px]   flex">Content</div>';

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.strictEqual(
        fixed,
        '<div className="text-xs   h-16   flex">Content</div>',
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

      const count = fixFile(tempFile, { customTextTokens: { 11: '2xs' } });

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
          <div className="text-[12px] p-[16px]">
            <h1 className="text-[24px]">Title</h1>
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
      assert.match(fixed, /className="text-xs p-4"/);
      assert.match(fixed, /className="text-2xl"/);
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
      text-[12px]
      h-[64px]
      flex
    ">Content</div>`;

    try {
      writeFileSync(tempFile, content, 'utf8');

      const count = fixFile(tempFile);

      assert.strictEqual(count, 2);

      const fixed = readFileSync(tempFile, 'utf8');
      assert.match(fixed, /text-xs/);
      assert.match(fixed, /h-16/);
    } finally {
      unlinkSync(tempFile);
    }
  });
});
