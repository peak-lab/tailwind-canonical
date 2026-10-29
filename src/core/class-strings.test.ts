import assert from 'node:assert';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { analyzeContent } from './analyzer.js';
import { extractClassStrings, replaceClassStrings } from './class-strings.js';
import { dedupeContent, dedupeFile } from './deduplicator.js';
import { fixContent, fixFile } from './fixer.js';
import { sortContent, sortFile } from './sorter.js';
import { analyzeTyposContent } from './typos.js';

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

  await t.test('transforms template literal args', () => {
    const { result, count } = replaceClassStrings(
      'cn(`flex p-4`)',
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, 'cn(`FLEX P-4`)');
    assert.strictEqual(count, 1);
  });

  await t.test('preserves interpolation in template literal', () => {
    const D = '$';
    const { result } = replaceClassStrings(
      `cn(\`flex ${D}{x} p-4\`)`,
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, `cn(\`FLEX ${D}{x} P-4\`)`);
  });

  await t.test('does not miscount parens inside interpolation', () => {
    const D = '$';
    const { result, count } = replaceClassStrings(
      `cn(\`p-4 ${D}{a ? "x" : "y"}\`, "flex")`,
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, `cn(\`P-4 ${D}{a ? "x" : "y"}\`, "FLEX")`);
    assert.strictEqual(count, 2);
  });

  await t.test('preserves unterminated strings in configured functions', () => {
    const input = 'cn("flex p-4';
    const { result, count } = replaceClassStrings(
      input,
      (s) => s.toUpperCase(),
      FN_OPTS,
    );
    assert.strictEqual(result, input);
    assert.strictEqual(count, 0);
  });
});

test('replaceClassStrings - braced attribute strings', async (t: TestContext) => {
  await t.test('transforms className={`...`}', () => {
    const { result, count } = replaceClassStrings(
      '<div className={`text-[18px] px-[16px]`}>',
      (s) => s.replace('text-[18px]', 'text-lg').replace('px-[16px]', 'px-4'),
    );

    assert.strictEqual(count, 1);
    assert.strictEqual(result, '<div className={`text-lg px-4`}>');
  });

  await t.test('transforms className={"..."}', () => {
    const { result, count } = replaceClassStrings(
      '<div className={"size-[12px]"}>',
      (s) => s.replace('size-[12px]', 'size-3'),
    );

    assert.strictEqual(count, 1);
    assert.strictEqual(result, '<div className={"size-3"}>');
  });

  await t.test("transforms className={'...'}", () => {
    const { result, count } = replaceClassStrings(
      "<div className={'h-[64px]'}>",
      (s) => s.replace('h-[64px]', 'h-16'),
    );

    assert.strictEqual(count, 1);
    assert.strictEqual(result, "<div className={'h-16'}>");
  });
});

test('fixFile with functionNames', async (t: TestContext) => {
  await t.test('fixes arbitrary values inside cn()', async () => {
    const file = join(tmpdir(), `fn-fix-${Date.now()}.tsx`);
    writeFileSync(file, 'cn("flex size-[12px] h-[64px]")', 'utf8');
    try {
      const count = fixFile(file, { functionNames: ['cn'] });
      assert.strictEqual(count, 2);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('size-3'));
      assert.ok(result.includes('h-16'));
      assert.ok(!result.includes('size-[12px]'));
    } finally {
      unlinkSync(file);
    }
  });

  await t.test(
    'preserves interpolation when fixing (tokenization parity)',
    async () => {
      const D = '$';
      const file = join(tmpdir(), `fn-fix-interp-${Date.now()}.tsx`);
      writeFileSync(file, `cn(\`size-[12px] ${D}{y} p-[16px]\`)`, 'utf8');
      try {
        const count = fixFile(file, { functionNames: ['cn'] });
        assert.strictEqual(count, 2);
        assert.strictEqual(
          readFileSync(file, 'utf8'),
          `cn(\`size-3 ${D}{y} p-4\`)`,
        );
      } finally {
        unlinkSync(file);
      }
    },
  );

  await t.test('no-op without functionNames config', async () => {
    const file = join(tmpdir(), `fn-fix-${Date.now()}.tsx`);
    const content = 'cn("flex size-[12px]")';
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
      '<div class="size-[12px] flex">',
      (s) => s.replace('size-[12px]', 'size-3'),
      { attributeNames: ['class'] },
    );
    assert.strictEqual(count, 1);
    assert.ok(result.includes('class="size-3 flex"'));
  });

  await t.test('transforms :class= attribute (Vue)', () => {
    const { result, count } = replaceClassStrings(
      `:class="'text-[14px] p-4'"`,
      (s) => s.replace('text-[14px]', 'text-sm'),
      { attributeNames: [':class'] },
    );
    assert.strictEqual(count, 1);
    assert.ok(result.includes(`:class="'text-sm p-4'"`));
  });

  await t.test('transforms multiple attribute names', () => {
    const { result, count } = replaceClassStrings(
      '<div class="size-[12px]" className="text-[14px]">',
      (s) =>
        s.replace('size-[12px]', 'size-3').replace('text-[14px]', 'text-sm'),
      { attributeNames: ['class', 'className'] },
    );
    assert.strictEqual(count, 2);
    assert.ok(result.includes('class="size-3"'));
    assert.ok(result.includes('className="text-sm"'));
  });

  await t.test('default only matches className, not class', () => {
    const input = '<div class="size-[12px]">';
    const { count } = replaceClassStrings(input, (s) =>
      s.replace('size-[12px]', 'size-3'),
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

  await t.test(
    'does not match attributes that merely contain className',
    () => {
      const input =
        '<div data-className="size-[12px]" xclassName="h-[64px]" className="w-[16px]">';
      const { result, count } = replaceClassStrings(input, (s) =>
        s
          .replace('size-[12px]', 'size-3')
          .replace('h-[64px]', 'h-16')
          .replace('w-[16px]', 'w-4'),
      );

      assert.strictEqual(count, 1);
      assert.strictEqual(
        result,
        '<div data-className="size-[12px]" xclassName="h-[64px]" className="w-4">',
      );
    },
  );

  await t.test('matches configured colon-prefixed attributes exactly', () => {
    const { result, count } = replaceClassStrings(
      `<div data-:class="size-[12px]" :class="'text-[14px]'">`,
      (s) =>
        s.replace('size-[12px]', 'size-3').replace('text-[14px]', 'text-sm'),
      { attributeNames: [':class'] },
    );

    assert.strictEqual(count, 1);
    assert.strictEqual(
      result,
      `<div data-:class="size-[12px]" :class="'text-sm'">`,
    );
  });
});

test('fixFile with attributeNames', async (t: TestContext) => {
  await t.test('fixes class= in HTML file', async () => {
    const file = join(tmpdir(), `attr-fix-${Date.now()}.html`);
    writeFileSync(file, '<div class="size-[12px] p-4">', 'utf8');
    try {
      const count = fixFile(file, { attributeNames: ['class'] });
      assert.strictEqual(count, 1);
      const result = readFileSync(file, 'utf8');
      assert.ok(result.includes('class="size-3 p-4"'));
    } finally {
      unlinkSync(file);
    }
  });
});

test('keeps template expressions and partial dynamic tokens outside transforms', () => {
  const input =
    'cn(`size-[12px]' +
    '$' +
    '{suffix} ' +
    '$' +
    '{prefix}h-[16px] p-[16px] ' +
    '$' +
    '{a + a + a}`)';
  assert.strictEqual(
    replaceClassStrings(input, (s) => s.toUpperCase(), FN_OPTS).result,
    'cn(`size-[12px]' +
      '$' +
      '{suffix} ' +
      '$' +
      '{prefix}h-[16px] P-[16PX] ' +
      '$' +
      '{a + a + a}`)',
  );
  assert.deepStrictEqual(
    extractClassStrings(input, FN_OPTS)
      .map(({ value }) => value.trim())
      .filter(Boolean),
    ['p-[16px]'],
  );
});

test('does not duplicate ranges from nested configured calls', () => {
  assert.strictEqual(
    extractClassStrings('cn(cn("p-[16px]"))', FN_OPTS).length,
    1,
  );
});

test('ignores comments inside configured calls', () => {
  const input = 'cn(/* "h-[16px]" ( */ "p-[16px]")';
  assert.strictEqual(
    replaceClassStrings(input, (s) => s.toUpperCase(), FN_OPTS).result,
    'cn(/* "h-[16px]" ( */ "P-[16PX]")',
  );
});

test('preserves whitespace at interpolation boundaries during sorting', () => {
  const input = 'cn(`p-4 flex ' + '$' + '{classes} text-sm block`)';
  assert.strictEqual(
    replaceClassStrings(input, (s) => s.split(' ').reverse().join(' '), FN_OPTS)
      .result,
    'cn(`flex p-4 ' + '$' + '{classes} block text-sm`)',
  );
});

test('preserves attribute formatting on unchanged and changed values', () => {
  const input = '<div className = "flex p-4" />';
  assert.strictEqual(replaceClassStrings(input, (s) => s).result, input);
  assert.strictEqual(
    replaceClassStrings(input, (s) => s.toUpperCase()).result,
    '<div className = "FLEX P-4" />',
  );
});

test('preserves regex predicates while transforming their class-valued branch', () => {
  const input = 'cn(/"p-[16px]"/.test(value) && "p-[16px]")';
  assert.strictEqual(
    replaceClassStrings(input, (s) => s.toUpperCase(), FN_OPTS).result,
    'cn(/"p-[16px]"/.test(value) && "P-[16PX]")',
  );
  assert.deepStrictEqual(
    extractClassStrings(input, FN_OPTS).map(({ value }) => value),
    ['p-[16px]'],
  );
});

test('protects template expressions containing regex braces', () => {
  const input = 'cn(`p-4 ' + '$' + '{/}/.test("p-[16px]")} h-[16px]`)';
  assert.strictEqual(
    replaceClassStrings(input, (s) => s.toUpperCase(), FN_OPTS).result,
    'cn(`P-4 ' + '$' + '{/}/.test("p-[16px]")} H-[16PX]`)',
  );
});

test('content transforms retain dynamic expressions while fixing complete static classes', () => {
  const input =
    'cn(`size-[12px]' + '$' + '{suffix} p-[16px] ' + '$' + '{a + a + a}`)';
  assert.strictEqual(
    fixContent(input, FN_OPTS).result,
    'cn(`size-[12px]' + '$' + '{suffix} p-4 ' + '$' + '{a + a + a}`)',
  );
  assert.strictEqual(dedupeContent(input, FN_OPTS).result, input);
});

test('does not transform class-like examples in source comments, prose or regex literals', () => {
  for (const input of [
    '// cn("p-[16px]")\n// className="h-[16px]"',
    '/* cn("p-[16px]") className="h-[16px]" */',
    'const example = "cn(\'p-[16px]\')";',
    'const example = \'<div className="h-[16px]" />\';',
    'const pattern = /cn("p-[16px]")/;',
    '<!-- <div className="h-[16px]" /> -->',
  ]) {
    assert.strictEqual(fixContent(input, FN_OPTS).result, input);
    assert.deepStrictEqual(analyzeContent('example.tsx', input, FN_OPTS), []);
  }
});

test('continues processing actual classes after comments and JSX apostrophes', () => {
  const input =
    '// cn("h-[16px]")\n<div>Don\'t stop</div><Foo /><Bar className="p-[16px]" />';
  assert.strictEqual(
    fixContent(input, FN_OPTS).result,
    '// cn("h-[16px]")\n<div>Don\'t stop</div><Foo /><Bar className="p-4" />',
  );
});

test('fix and analyze agree on suppression inside multiline class strings', () => {
  for (const input of [
    '<div className="\np-[16px]\n// tailwind-canonical-disable-next-line\nh-[24px]\nw-[16px]\n"/>',
    'cn(`\np-[16px]\n// tailwind-canonical-disable-next-line\nh-[24px]\nw-[16px]\n`)',
  ]) {
    const findings = analyzeContent('example.tsx', input, FN_OPTS);
    assert.deepStrictEqual(
      findings.map(({ suggestion }) => suggestion.original),
      ['p-[16px]', 'w-[16px]'],
    );
    const fixed = fixContent(input, FN_OPTS);
    assert.strictEqual(fixed.count, findings.length);
    assert.strictEqual(
      fixed.result,
      input.replace('p-[16px]', 'p-4').replace('w-[16px]', 'w-4'),
    );
  }
});

test('recognizes interpolation after an escaped backslash', () => {
  const input = [
    'cn(`p-[16px] ',
    '\\'.repeat(2),
    '$',
    '{fn("p-[16px]")}`)',
  ].join('');
  assert.strictEqual(
    fixContent(input, FN_OPTS).result,
    input.replace('p-[16px]', 'p-4'),
  );
});

test('does not interpret JSX URL text as a source comment', () => {
  const input = '<p>https://example.com/path</p><div className="p-[16px]" />';
  assert.strictEqual(
    fixContent(input, FN_OPTS).result,
    '<p>https://example.com/path</p><div className="p-4" />',
  );
  assert.strictEqual(analyzeContent('example.tsx', input, FN_OPTS).length, 1);
});

test('preserves quoted prose immediately after a JavaScript keyword', () => {
  const input = `function f(){return'cn("size-[12px]")';}`;
  assert.strictEqual(fixContent(input, FN_OPTS).result, input);
  assert.deepStrictEqual(analyzeContent('example.ts', input, FN_OPTS), []);
});

test('transforms only proven class positions in complex configured calls', () => {
  const opts = { functionNames: ['cn', 'cva'] };
  for (const [input, expected] of [
    [
      'cn({"p-[16px]": value === "size-[12px]"})',
      'cn({"p-4": value === "size-[12px]"})',
    ],
    ['cn(fetch("size-[12px]"), "p-[8px]")', 'cn(fetch("size-[12px]"), "p-2")'],
    [
      'cn(value === "size-[12px]" && "p-[8px]")',
      'cn(value === "size-[12px]" && "p-2")',
    ],
    ['cn({"p-[16px]": cn("size-[12px]")})', 'cn({"p-4": cn("size-[12px]")})'],
    [
      'cva("p-[16px]", {variants: {size: {"size-[12px]": "p-[8px]"}}, defaultVariants: {size: "size-[12px]"}})',
      'cva("p-4", {variants: {size: {"size-[12px]": "p-2"}}, defaultVariants: {size: "size-[12px]"}})',
    ],
  ]) {
    const findings = analyzeContent('example.ts', input, opts);
    const fixed = fixContent(input, opts);
    assert.strictEqual(fixed.result, expected);
    assert.strictEqual(fixed.count, findings.length);
    assert.deepStrictEqual(analyzeContent('example.ts', expected, opts), []);
  }
});

test('quoted JSX text does not hide nested attributes', () => {
  for (const input of [
    '<p>"<span className=\'size-[12px]\' />"</p>',
    '<p><em>note</em>"<span className=\'size-[12px]\' />"</p>',
    '<p>{label}"<span className=\'size-[12px]\' />"</p>',
  ]) {
    assert.strictEqual(
      fixContent(input, FN_OPTS).result,
      input.replace('size-[12px]', 'size-3'),
    );
    assert.strictEqual(analyzeContent('example.tsx', input, FN_OPTS).length, 1);
  }
});

test('regex and division arguments do not hide subsequent calls', () => {
  for (const input of [
    'cn(/"p-[16px]"/.test(value)); cn("size-[12px]")',
    'cn(total / 2); cn("size-[12px]")',
    'cn(/[(}]/.test(value)); cn("size-[12px]")',
    'cn(total / fn("p-[16px]")); cn("size-[12px]")',
  ]) {
    assert.strictEqual(
      fixContent(input, FN_OPTS).result,
      input.replace('size-[12px]', 'size-3'),
    );
    assert.strictEqual(analyzeContent('example.ts', input, FN_OPTS).length, 1);
  }
});

test('cva identifiers and compound predicates remain unchanged', () => {
  const input =
    'cva("p-[16px]", { variants: {"size-[12px]": {"p-[16px]": ["h-[16px]", "w-[16px]"]}}, defaultVariants: {"size-[12px]": "p-[16px]"}, compoundVariants: [{"size-[12px]": "p-[16px]", class: "m-[16px]", className: "gap-[16px]"}] })';
  const expected =
    'cva("p-4", { variants: {"size-[12px]": {"p-[16px]": ["h-4", "w-4"]}}, defaultVariants: {"size-[12px]": "p-[16px]"}, compoundVariants: [{"size-[12px]": "p-[16px]", class: "m-4", className: "gap-4"}] })';
  const opts = { functionNames: ['cva'] };
  assert.strictEqual(fixContent(input, opts).result, expected);
  assert.strictEqual(analyzeContent('example.ts', input, opts).length, 5);
});

test('leaves spreads, computed properties, unknown calls and tagged templates intact', () => {
  for (const input of [
    'cn({...get("size-[12px]")})',
    'cn({["size-[12px]"]: enabled})',
    'cn(fetch("size-[12px]"))',
    'cn(tag`size-[12px]`)',
    'cva("flex", dynamicOptions("size-[12px]"))',
  ]) {
    const opts = { functionNames: ['cn', 'cva'] };
    assert.strictEqual(fixContent(input, opts).result, input);
    assert.deepStrictEqual(analyzeContent('example.ts', input, opts), []);
  }
});

test('regex and division inside templates preserve code and later calls', () => {
  for (const expression of [
    '/}/.test("size-[12px]")',
    'total / 2',
    '"a" + /}/.test("size-[12px]")',
  ]) {
    const input = [
      'cn(`p-[16px] ',
      '$',
      '{',
      expression,
      '} h-[16px]`); cn("w-[16px]")',
    ].join('');
    const expected = [
      'cn(`p-4 ',
      '$',
      '{',
      expression,
      '} h-4`); cn("w-4")',
    ].join('');
    assert.strictEqual(fixContent(input, FN_OPTS).result, expected);
    assert.strictEqual(analyzeContent('example.ts', input, FN_OPTS).length, 3);
  }
});

test('braced attribute strings allow surrounding whitespace without rewriting formatting', () => {
  for (const input of [
    '<div className={ "size-[12px]" } />',
    "<div className={\n  'size-[12px]'\n} />",
    '<div className = { `size-[12px]` } />',
  ]) {
    const fixed = fixContent(input);
    assert.strictEqual(fixed.result, input.replace('size-[12px]', 'size-3'));
    assert.strictEqual(fixed.count, 1);
    assert.strictEqual(analyzeContent('example.tsx', input).length, 1);
  }
});

test('escaped quotes do not terminate braced attribute strings early', () => {
  const input = '<div className={ "p-[16px] \\"icon\\" h-[16px]" } />';
  const fixed = fixContent(input);
  assert.strictEqual(
    fixed.result,
    input.replace('p-[16px]', 'p-4').replace('h-[16px]', 'h-4'),
  );
  assert.strictEqual(fixed.count, 2);
  assert.strictEqual(analyzeContent('example.tsx', input).length, 2);
});

test('nested templates inside attribute expressions remain JavaScript while static tokens are fixed', () => {
  const input = [
    '<div className={ `p-[16px] ',
    '$',
    '{fn(`size-[12px] ',
    '$',
    '{value}`)} h-[16px]` } />',
  ].join('');
  const expected = [
    '<div className={ `p-4 ',
    '$',
    '{fn(`size-[12px] ',
    '$',
    '{value}`)} h-4` } />',
  ].join('');
  assert.strictEqual(fixContent(input).result, expected);
  assert.strictEqual(analyzeContent('example.tsx', input).length, 2);
});

test('attribute expressions requiring computation are left intact', () => {
  for (const input of [
    '<div className={ "size-[12px]" + suffix } />',
    '<div className={ "size-[12px]".toUpperCase() } />',
    '<div className={ tag`size-[12px]` } />',
  ]) {
    assert.strictEqual(fixContent(input).result, input);
    assert.deepStrictEqual(analyzeContent('example.tsx', input), []);
  }
});

test('conditional class branches honor ternary and logical precedence', () => {
  for (const [input, expected, count] of [
    [
      'cn(flag ? "size-[12px]" : other && "size-[16px]")',
      'cn(flag ? "size-3" : other && "size-4")',
      2,
    ],
    ['cn("size-[12px]" || other)', 'cn("size-3" || other)', 1],
    ['cn("size-[12px]" ?? other)', 'cn("size-3" ?? other)', 1],
    [
      'cn(flag && predicate === "size-[12px]" ? "p-[8px]" : "m-[8px]")',
      'cn(flag && predicate === "size-[12px]" ? "p-2" : "m-2")',
      2,
    ],
    ['cn("size-[12px]" && "p-[8px]")', 'cn("size-[12px]" && "p-2")', 1],
  ] as const) {
    assert.strictEqual(fixContent(input, FN_OPTS).result, expected);
    assert.strictEqual(
      analyzeContent('example.ts', input, FN_OPTS).length,
      count,
    );
  }
});

test('object-key transforms cannot create collisions or overwrite predicates', () => {
  for (const input of [
    'cn({"p-[16px]": enabled, "p-4": other})',
    'cn({"p-2 p-4": enabled, "p-4": other})',
    'cn({"p-[16px]": enabled, ...other})',
    'cn({"p-[16px]": enabled, [other]: flag})',
  ]) {
    assert.strictEqual(fixContent(input, FN_OPTS).result, input);
    assert.strictEqual(dedupeContent(input, FN_OPTS).result, input);
    assert.deepStrictEqual(analyzeContent('example.ts', input, FN_OPTS), []);
  }
});

test('Vue bindings transform class-valued branches and preserve predicates', () => {
  const opts = {
    attributeNames: [':class', 'v-bind:class'],
    functionNames: ['cn'],
  };
  for (const [input, expected] of [
    [
      `<div :class="kind === 'p-[16px]' ? 'p-[8px]' : 'hidden'" />`,
      `<div :class="kind === 'p-[16px]' ? 'p-2' : 'hidden'" />`,
    ],
    [
      `<div v-bind:class="['p-[16px]', active && 'h-[16px]']" />`,
      `<div v-bind:class="['p-4', active && 'h-4']" />`,
    ],
    [
      `<div :class="{'p-[16px]': active}" />`,
      `<div :class="{'p-4': active}" />`,
    ],
    [
      `<div :class="'p-[16px]' + suffix" />`,
      `<div :class="'p-[16px]' + suffix" />`,
    ],
    ['<div :class="size-[16px]" />', '<div :class="size-[16px]" />'],
    [
      '<div :class="&quot;p-[16px]&quot;" />',
      '<div :class="&quot;p-[16px]&quot;" />',
    ],
  ]) {
    assert.strictEqual(fixContent(input, opts).result, expected);
    assert.deepStrictEqual(analyzeContent('example.vue', expected, opts), []);
  }
});

test('Svelte and JSX braced branches preserve predicates and computations', () => {
  for (const attr of ['class', 'className']) {
    const input = `<div ${attr}={kind === "p-[16px]" ? "h-[16px]" : "hidden"} />`;
    const opts = { attributeNames: [attr] };
    assert.strictEqual(
      fixContent(input, opts).result,
      input.replace('h-[16px]', 'h-4'),
    );
    assert.strictEqual(analyzeContent('example.svelte', input, opts).length, 1);
  }
});

test('component scripts are JavaScript, style blocks stay opaque, fragments preserve text', () => {
  for (const input of [
    '<script setup>const cls=cn("p-[16px]")</script><template><div className="p-[16px]" /></template>',
    '<script lang="ts">const cls=cn("p-[16px]")</script><style>.x { --value: cn("p-[16px]") }</style>',
    '<>Don\'t stop<div className="p-[16px]" /></>',
    '<><img src="test" />Don\'t stop<div className="p-[16px]" /></>',
  ]) {
    const expected = input
      .replaceAll('cn("p-[16px]")</script>', 'cn("p-4")</script>')
      .replaceAll('className="p-[16px]"', 'className="p-4"');
    assert.strictEqual(fixContent(input, FN_OPTS).result, expected);
  }
});

test('markup interpolation holes preserve Svelte predicates and partial tokens', () => {
  const input = `<div class="size-[12px]{suffix} p-[16px] {kind === 'h-[16px]' ? 'block' : 'hidden'}" />`;
  const opts = { attributeNames: ['class'] };
  const result = fixContent(input, opts);
  assert.strictEqual(result.result, input.replace('p-[16px]', 'p-4'));
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(
    analyzeContent('example.svelte', input, opts).map(
      ({ suggestion }) => suggestion.original,
    ),
    ['p-[16px]'],
  );
});

test('rewrites use original source lines for suppressions regardless of transform order', () => {
  for (const [input, expected] of [
    [
      '<div className="text-sm\n flex" />\n// tailwind-canonical-disable-next-line\ncn("text-sm flex")',
      '<div className="flex text-sm" />\n// tailwind-canonical-disable-next-line\ncn("text-sm flex")',
    ],
    [
      'cn(`text-sm\n flex`)\n// tailwind-canonical-disable-next-line\n<div className="text-sm flex" />',
      'cn(`flex text-sm`)\n// tailwind-canonical-disable-next-line\n<div className="text-sm flex" />',
    ],
  ]) {
    const result = sortContent(input, FN_OPTS);
    assert.strictEqual(result.result, expected);
    assert.strictEqual(result.count, 1);
  }
});

test('overlapping attributes and configured calls transform each source range once', () => {
  const input = '<div className={cn("size-[12px] p-[16px]")} />';
  const calls: string[] = [];
  const result = replaceClassStrings(
    input,
    (value) => {
      calls.push(value);
      return value.toUpperCase();
    },
    FN_OPTS,
  );
  assert.deepStrictEqual(calls, ['size-[12px] p-[16px]']);
  assert.strictEqual(result.count, 1);
  assert.strictEqual(
    result.result,
    input.replace('size-[12px] p-[16px]', 'SIZE-[12PX] P-[16PX]'),
  );
  const fixed = fixContent(input, FN_OPTS);
  assert.strictEqual(fixed.count, 2);
  assert.strictEqual(
    fixed.result,
    input.replace('size-[12px] p-[16px]', 'size-3 p-4'),
  );
  assert.strictEqual(extractClassStrings(input, FN_OPTS).length, 1);
});

test('regex statements after control conditions remain opaque without hiding division or later calls', () => {
  for (const input of [
    'if (ready) /cn("p-[16px]")/.test(value); cn("h-[16px]")',
    'if ((ready && check(value))) /cn("p-[16px]")/.test(value); cn("h-[16px]")',
    'while (ready) /cn("p-[16px]")/.test(value); cn("h-[16px]")',
    'const ratio = total / (count + 1); cn("h-[16px]")',
    'const ratio = getTotal() / 2; cn("h-[16px]")',
    'const ratio = total / fn("p-[16px]"); cn("h-[16px]")',
  ]) {
    assert.strictEqual(
      fixContent(input, FN_OPTS).result,
      input.replace('h-[16px]', 'h-4'),
    );
    assert.strictEqual(analyzeContent('example.ts', input, FN_OPTS).length, 1);
  }
});

test('configured identifiers do not select unrelated object methods or identifier suffixes', () => {
  for (const input of [
    'business.cn("p-[16px]"); cn("h-[16px]")',
    'business?.cn("p-[16px]"); cn("h-[16px]")',
    'business . cn("p-[16px]"); cn("h-[16px]")',
    '$cn("p-[16px]"); cn("h-[16px]")',
    'data$cn("p-[16px]"); cn("h-[16px]")',
  ]) {
    assert.strictEqual(
      fixContent(input, FN_OPTS).result,
      input.replace('h-[16px]', 'h-4'),
    );
    assert.strictEqual(analyzeContent('example.ts', input, FN_OPTS).length, 1);
  }
});

test('arbitrary content quotes and braces are part of one class token', () => {
  for (const input of [
    `<div className="before:content-['size-[12px]'] p-[16px]" />`,
    String.raw`cn("before:content-[\"size-[12px]\"] p-[16px]")`,
    `<div className="before:content-['{'] p-[16px]" />`,
    `<div className="before:content-['text-gry-500'] text-gry-500 p-[16px]" />`,
    `<div className="[--object:{foo}] p-[16px]" />`,
  ]) {
    const result = fixContent(input, FN_OPTS);
    assert.strictEqual(result.result, input.replace('p-[16px]', 'p-4'));
    assert.strictEqual(result.count, 1);
    assert.deepStrictEqual(
      analyzeContent('example.tsx', input, FN_OPTS).map(
        ({ suggestion }) => suggestion.original,
      ),
      ['p-[16px]'],
    );
    const typos = analyzeTyposContent('example.tsx', input, FN_OPTS);
    assert.deepStrictEqual(
      typos.map(({ original }) => original),
      input.includes(' text-gry-500 ') ? ['text-gry-500'] : [],
    );
  }
});

test('regex after statement blocks is opaque and object division does not hide later calls', () => {
  for (const input of [
    'if (ok) {} /cn("p-[16px]")/.test(value); cn("h-[16px]")',
    'function f() {} /cn("p-[16px]")/.test(value); cn("h-[16px]")',
    'const ratio = {value: 2} / 2; cn("h-[16px]")',
    'const ratio = ({value: 2}) / 2; cn("h-[16px]")',
  ]) {
    assert.strictEqual(
      fixContent(input, FN_OPTS).result,
      input.replace('h-[16px]', 'h-4'),
    );
    assert.strictEqual(analyzeContent('example.ts', input, FN_OPTS).length, 1);
  }
});

test('regex statement prefixes preserve literals and continue to the next helper call', () => {
  for (const input of [
    'if (ok) foo(); else /cn("p-[16px]")/.test(value); cn("h-[16px]")',
    'do /cn("p-[16px]")/.test(value); while (ok); cn("h-[16px]")',
    'function* f() { yield /cn("p-[16px]")/; } cn("h-[16px]")',
  ]) {
    assert.strictEqual(
      fixContent(input, FN_OPTS).result,
      input.replace('h-[16px]', 'h-4'),
    );
    assert.strictEqual(analyzeContent('example.ts', input, FN_OPTS).length, 1);
  }
});
