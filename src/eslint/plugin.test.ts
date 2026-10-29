import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { Linter } from 'eslint';
import plugin from './plugin.js';

const {
  'no-arbitrary-canonical': noArbitraryCanonical,
  'no-conflicting-classes': noConflictingClasses,
} = plugin.rules;

function makeContext(reports: unknown[]) {
  return {
    options: [] as [],
    report(descriptor: unknown) {
      reports.push(descriptor);
    },
  };
}

const classAttribute = {
  type: 'JSXAttribute',
  name: { type: 'JSXIdentifier', name: 'className' },
};
const classExpression = {
  type: 'JSXExpressionContainer',
  parent: classAttribute,
};
function literal(value: string, raw = `"${value}"`, parent = classExpression) {
  return { type: 'Literal' as const, value, raw, parent };
}

function applyLiteralFix(
  fix:
    | ((fixer: {
        replaceText: (node: unknown, text: string) => string;
      }) => string)
    | undefined,
): string {
  assert.ok(fix);
  return fix({ replaceText: (_node, text) => text });
}

function applyQuasiFix(
  source: string,
  fix:
    | ((fixer: {
        replaceTextRange: (range: [number, number], text: string) => string;
      }) => string)
    | undefined,
): string {
  assert.ok(fix);
  return fix({
    replaceTextRange: ([start, end], text) =>
      source.slice(0, start) + text + source.slice(end),
  });
}

test('no-arbitrary-canonical rule', async (t) => {
  await t.test('reports size-[12px] with canonical size-3', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('size-[12px]'));
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('size-3'));
  });

  await t.test('reports nothing for plain size-3', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('size-3'));
    assert.strictEqual(reports.length, 0);
  });

  await t.test('reports nothing for non-string literal', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)({
      type: 'Literal',
      value: 42,
      raw: '42',
    });
    assert.strictEqual(reports.length, 0);
  });

  await t.test(
    'reports one combined issue for multiple classes in one literal',
    () => {
      const reports: unknown[] = [];
      const ctx = {
        options: [{}] as [object],
        report: (d: unknown) => reports.push(d),
      };
      const rule = noArbitraryCanonical.create(ctx as never);
      (rule.Literal as (n: unknown) => void)(
        literal('size-[12px] h-[64px] flex'),
      );
      assert.strictEqual(reports.length, 1);
      assert.ok(JSON.stringify(reports[0]).includes('size-3 h-16'));
    },
  );

  await t.test('applies fix that replaces arbitrary with canonical', () => {
    const reports: Array<{
      fix?: (f: { replaceText: (n: unknown, s: string) => string }) => string;
    }> = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d as never),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    const node = literal('size-[12px]');
    (rule.Literal as (n: unknown) => void)(node);
    assert.ok(reports[0].fix);
    const result = reports[0].fix?.({ replaceText: (_n, s) => s });
    assert.ok((result as string).includes('size-3'));
  });

  await t.test('fix does not corrupt classes via substring collision', () => {
    const reports: Array<{
      fix?: (f: { replaceText: (n: unknown, s: string) => string }) => string;
    }> = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d as never),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('max-w-[50%] w-[50%]'));
    assert.strictEqual(reports.length, 1);
    for (const r of reports) {
      const result = r.fix?.({ replaceText: (_n, s) => s });
      assert.strictEqual(result, '"max-w-1/2 w-1/2"');
    }
  });

  await t.test('fix corrects every arbitrary token in one replacement', () => {
    const reports: Array<{
      fix?: (f: { replaceText: (n: unknown, s: string) => string }) => string;
    }> = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d as never),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(
      literal('size-[12px] flex h-[64px]'),
    );
    assert.strictEqual(reports.length, 1);
    const result = reports[0].fix?.({ replaceText: (_n, s) => s });
    assert.strictEqual(result, '"size-3 flex h-16"');
  });

  await t.test('fix preserves escaped quotes in string literals', () => {
    const reports: Array<{
      fix?: (f: { replaceText: (n: unknown, s: string) => string }) => string;
    }> = [];
    const rule = noArbitraryCanonical.create({
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const raw = String.raw`'don\'t size-[12px]'`;
    (rule.Literal as (n: unknown) => void)(literal("don't size-[12px]", raw));

    const output = applyLiteralFix(reports[0]?.fix);
    assert.strictEqual(output, String.raw`'don\'t size-3'`);
    assert.strictEqual(Function(`return ${output}`)(), "don't size-3");
  });

  await t.test('fix preserves JSX attribute entity escaping', () => {
    const reports: Array<{
      fix?: (f: { replaceText: (n: unknown, s: string) => string }) => string;
    }> = [];
    const rule = noArbitraryCanonical.create({
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const raw = '"before &quot; size-[12px]"';
    (rule.Literal as (n: unknown) => void)(
      literal('before " size-[12px]', raw, classAttribute),
    );

    assert.strictEqual(
      applyLiteralFix(reports[0]?.fix),
      '"before &quot; size-3"',
    );
  });

  await t.test('respects customTextTokens from config', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [
        {
          allowTextSizeLineHeightChanges: true,
          customTextTokens: { 11: 'tiny' },
        },
      ] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('text-[11px]'));
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('tiny'));
  });

  await t.test('honors ignorePatterns from config', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{ ignorePatterns: [/^size-/] }] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('size-[12px] h-[64px]'));
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('h-16'));
  });

  await t.test('accepts a shared Config without schema errors', () => {
    const props = (
      noArbitraryCanonical.meta.schema[0] as {
        properties: Record<string, unknown>;
      }
    ).properties;
    for (const key of [
      'customTextTokens',
      'customSpacingTokens',
      'ignorePatterns',
      'functionNames',
      'attributeNames',
      'sortOrder',
      'tailwindVersion',
    ]) {
      assert.ok(key in props, `schema should declare ${key}`);
    }
    const ctx = {
      options: [
        {
          functionNames: ['cn'],
          attributeNames: ['className'],
          sortOrder: ['display'],
          ignorePatterns: [/^z-/],
        },
      ] as [object],
      report: () => undefined,
    };
    assert.doesNotThrow(() => noArbitraryCanonical.create(ctx as never));
  });

  await t.test('honors tailwindVersion from rule options', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{ tailwindVersion: 3 }] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    // p-13 does not exist in v3, so the autofixable rule must stay silent
    rule.Literal?.(literal('p-[52px]') as never);
    assert.strictEqual(reports.length, 0);
    rule.Literal?.(literal('p-[16px]') as never);
    assert.strictEqual(reports.length, 1);
  });

  await t.test(
    'honors ignorePatterns and accepts shared context options',
    () => {
      const reports: unknown[] = [];
      const ctx = {
        options: [
          {
            functionNames: ['cn'],
            attributeNames: ['className'],
            sortOrder: ['display'],
            ignorePatterns: [/^size-/],
          },
        ] as [object],
        report: (d: unknown) => reports.push(d),
      };
      const rule = noArbitraryCanonical.create(ctx as never);
      (rule.Literal as (n: unknown) => void)(literal('size-[12px] h-[64px]'));
      assert.strictEqual(reports.length, 1);
      assert.ok(JSON.stringify(reports[0]).includes('h-16'));
      assert.ok(!JSON.stringify(reports[0]).includes('size-3'));
    },
  );
});

test('no-conflicting-classes rule', async (t) => {
  await t.test('reports conflicting bg classes', () => {
    const reports: unknown[] = [];
    const rule = noConflictingClasses.create(makeContext(reports) as never);
    (rule.Literal as (n: unknown) => void)(literal('bg-red-500 bg-blue-500'));
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('bg-blue-500'));
  });

  await t.test('reports conflicting text size', () => {
    const reports: unknown[] = [];
    const rule = noConflictingClasses.create(makeContext(reports) as never);
    (rule.Literal as (n: unknown) => void)(literal('text-sm text-xs'));
    assert.strictEqual(reports.length, 1);
  });

  await t.test('does not report non-conflicting classes', () => {
    const reports: unknown[] = [];
    const rule = noConflictingClasses.create(makeContext(reports) as never);
    (rule.Literal as (n: unknown) => void)(
      literal('flex items-center text-sm'),
    );
    assert.strictEqual(reports.length, 0);
  });

  await t.test('does not report variant + base (no conflict)', () => {
    const reports: unknown[] = [];
    const rule = noConflictingClasses.create(makeContext(reports) as never);
    (rule.Literal as (n: unknown) => void)(literal('text-sm hover:text-lg'));
    assert.strictEqual(reports.length, 0);
  });

  await t.test('fix replaces with merged value', () => {
    const reports: Array<{
      fix?: (f: { replaceText: (n: unknown, s: string) => string }) => string;
    }> = [];
    const rule = noConflictingClasses.create({
      options: [] as [],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const node = literal('bg-red-500 bg-blue-500');
    (rule.Literal as (n: unknown) => void)(node);
    assert.ok(reports[0]?.fix);
    const result = reports[0].fix?.({ replaceText: (_n, s) => s });
    assert.ok((result as string).includes('bg-blue-500'));
    assert.ok(!(result as string).includes('bg-red-500'));
  });

  await t.test('fix preserves escaped quotes in string literals', () => {
    const reports: Array<{
      fix?: (f: { replaceText: (n: unknown, s: string) => string }) => string;
    }> = [];
    const rule = noConflictingClasses.create({
      options: [] as [],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const raw = String.raw`'don\'t bg-red-500 bg-blue-500'`;
    (rule.Literal as (n: unknown) => void)(
      literal("don't bg-red-500 bg-blue-500", raw),
    );

    const output = applyLiteralFix(reports[0]?.fix);
    assert.strictEqual(output, String.raw`'don\'t bg-blue-500'`);
    assert.strictEqual(Function(`return ${output}`)(), "don't bg-blue-500");
  });
});

// Mirrors espree: a TemplateElement.range spans its delimiters too (leading
// backtick or `}`, trailing backtick or `${`), so the source string and the
// quasi ranges are built together. `source` lets fix tests apply the fixer's
// replaceTextRange against real source and confirm the delimiters survive.
function templateLiteral(...raws: string[]) {
  let source = '';
  const quasis = raws.map((raw, i) => {
    const tail = i === raws.length - 1;
    const lead = i === 0 ? '`' : '}';
    const trail = tail ? '`' : '${';
    const start = source.length;
    source += lead + raw + trail;
    const end = source.length;
    if (!tail) source += '0';
    return {
      type: 'TemplateElement' as const,
      value: { raw, cooked: raw },
      tail,
      range: [start, end] as [number, number],
      loc: {
        start: { line: 1, column: start },
        end: { line: 1, column: end },
      },
    };
  });
  return {
    type: 'TemplateLiteral' as const,
    parent: classExpression,
    quasis,
    expressions: [],
    source,
  };
}

function taggedTemplateLiteral(raw: string) {
  const tag = 'String.raw';
  const source = `${tag}\`${raw}\``;
  return {
    type: 'TemplateLiteral' as const,
    parent: { type: 'TaggedTemplateExpression' },
    quasis: [
      {
        type: 'TemplateElement' as const,
        value: { raw, cooked: raw.replace(/\\n/g, '\n') },
        range: [tag.length, source.length] as [number, number],
        loc: {
          start: { line: 1, column: tag.length },
          end: { line: 1, column: source.length },
        },
      },
    ],
    expressions: [],
    source,
  };
}

test('no-arbitrary-canonical - TemplateLiteral visitor', async (t) => {
  await t.test('reports arbitrary classes inside a template literal', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.TemplateLiteral as (n: unknown) => void)(
      templateLiteral('size-[12px] flex'),
    );
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('size-3'));
  });

  await t.test('walks every quasi of a multi-part template', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.TemplateLiteral as (n: unknown) => void)(
      templateLiteral('size-[12px] ', ' h-[64px]'),
    );
    assert.strictEqual(reports.length, 2);
  });

  await t.test(
    'fix rewrites the quasi text in place, preserving template delimiters',
    () => {
      const reports: {
        fix?: (f: {
          replaceTextRange: (r: [number, number], s: string) => unknown;
          replaceText: () => never;
        }) => unknown;
      }[] = [];
      const ctx = {
        options: [{}] as [object],
        report: (d: unknown) => reports.push(d as (typeof reports)[number]),
      };
      const rule = noArbitraryCanonical.create(ctx as never);

      // Single-quasi template and a multi-part template with an interpolation:
      // applying the fixer's range edit to the real source must keep every
      // backtick and interpolation intact and only swap the arbitrary class.
      const interp = `$${'{0}'}`;
      const cases: Array<[ReturnType<typeof templateLiteral>, string]> = [
        [templateLiteral('size-[12px] flex'), '`size-3 flex`'],
        [
          templateLiteral('p-2 size-[12px] ', ' flex'),
          `\`p-2 size-3 ${interp} flex\``,
        ],
      ];

      for (const [node, expected] of cases) {
        reports.length = 0;
        (rule.TemplateLiteral as (n: unknown) => void)(node);
        let output = node.source;
        for (const r of reports) {
          r.fix?.({
            replaceTextRange: (range, s) => {
              output = output.slice(0, range[0]) + s + output.slice(range[1]);
              return null;
            },
            replaceText: () => {
              throw new Error(
                'quasi fix must use replaceTextRange, not replaceText',
              );
            },
          });
        }
        assert.strictEqual(output, expected);
      }
    },
  );

  await t.test(
    'fix escapes template syntax introduced by cooked quasi text',
    () => {
      const reports: Array<{
        fix?: (f: {
          replaceTextRange: (r: [number, number], s: string) => string;
        }) => string;
      }> = [];
      const rule = noArbitraryCanonical.create({
        options: [{}] as [object],
        report: (d: unknown) => reports.push(d as never),
      } as never);
      const raw = String.raw`before \` \${ size-[12px]`;
      const source = `\`${raw}\``;
      (rule.TemplateLiteral as (n: unknown) => void)({
        type: 'TemplateLiteral',
        parent: classExpression,
        quasis: [
          {
            type: 'TemplateElement',
            value: { raw, cooked: 'before ` ${ size-[12px]' },
            range: [0, source.length],
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: source.length },
            },
          },
        ],
        expressions: [],
      });

      const output = applyQuasiFix(source, reports[0]?.fix);
      assert.strictEqual(output, `\`${String.raw`before \` \${ size-3`}\``);
      assert.strictEqual(Function(`return ${output}`)(), 'before ` ${ size-3');
    },
  );

  await t.test('fix preserves a cooked carriage return', () => {
    const reports: Array<{
      fix?: (f: {
        replaceTextRange: (r: [number, number], s: string) => string;
      }) => string;
    }> = [];
    const rule = noArbitraryCanonical.create({
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const raw = String.raw`before\rsize-[12px]`;
    const source = `\`${raw}\``;
    (rule.TemplateLiteral as (n: unknown) => void)({
      type: 'TemplateLiteral',
      parent: classExpression,
      quasis: [
        {
          type: 'TemplateElement',
          value: { raw, cooked: 'before\rsize-[12px]' },
          range: [0, source.length],
          loc: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: source.length },
          },
        },
      ],
      expressions: [],
    });

    const output = applyQuasiFix(source, reports[0]?.fix);
    assert.strictEqual(output, '`before\\rsize-3`');
    assert.strictEqual(Function(`return ${output}`)(), 'before\rsize-3');
  });

  await t.test('fix preserves raw tagged-template semantics', () => {
    const reports: Array<{
      fix?: (f: {
        replaceTextRange: (r: [number, number], s: string) => string;
      }) => string;
    }> = [];
    const rule = noArbitraryCanonical.create({
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const node = taggedTemplateLiteral(String.raw`path\n size-[12px]`);
    (rule.TemplateLiteral as (n: unknown) => void)(node);

    assert.strictEqual(reports.length, 0);
  });
});

test('no-conflicting-classes - TemplateLiteral visitor', async (t) => {
  await t.test('reports conflicts inside a template literal', () => {
    const reports: unknown[] = [];
    const rule = noConflictingClasses.create(makeContext(reports) as never);
    (rule.TemplateLiteral as (n: unknown) => void)(
      templateLiteral('bg-red-500 bg-blue-500'),
    );
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('bg-blue-500'));
  });

  await t.test('does not report a conflict-free template quasi', () => {
    const reports: unknown[] = [];
    const rule = noConflictingClasses.create(makeContext(reports) as never);
    (rule.TemplateLiteral as (n: unknown) => void)(
      templateLiteral('flex items-center'),
    );
    assert.strictEqual(reports.length, 0);
  });

  await t.test('fix escapes cooked template syntax', () => {
    const reports: Array<{
      fix?: (f: {
        replaceTextRange: (r: [number, number], s: string) => string;
      }) => string;
    }> = [];
    const rule = noConflictingClasses.create({
      options: [] as [],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const raw = String.raw`before \` \${ bg-red-500 bg-blue-500`;
    const source = `\`${raw}\``;
    (rule.TemplateLiteral as (n: unknown) => void)({
      type: 'TemplateLiteral',
      parent: classExpression,
      quasis: [
        {
          type: 'TemplateElement',
          value: { raw, cooked: 'before ` ${ bg-red-500 bg-blue-500' },
          range: [0, source.length],
          loc: {
            start: { line: 1, column: 0 },
            end: { line: 1, column: source.length },
          },
        },
      ],
      expressions: [],
    });

    const output = applyQuasiFix(source, reports[0]?.fix);
    assert.strictEqual(output, `\`${String.raw`before \` \${ bg-blue-500`}\``);
    assert.strictEqual(
      Function(`return ${output}`)(),
      'before ` ${ bg-blue-500',
    );
  });

  await t.test('fix preserves raw tagged-template semantics', () => {
    const reports: Array<{
      fix?: (f: {
        replaceTextRange: (r: [number, number], s: string) => string;
      }) => string;
    }> = [];
    const rule = noConflictingClasses.create({
      options: [] as [],
      report: (d: unknown) => reports.push(d as never),
    } as never);
    const node = taggedTemplateLiteral(
      String.raw`path\n bg-red-500 bg-blue-500`,
    );
    (rule.TemplateLiteral as (n: unknown) => void)(node);

    assert.strictEqual(reports.length, 0);
  });
});

test('conflict rule fails clearly when its optional peer is unavailable', () => {
  // Isolate module interception so other tests still use the installed peer.
  const script = `
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const Module = require('node:module');
    const load = Module._load;
    Module._load = function (id, ...args) {
      if (id === 'tailwind-merge') throw new Error('simulated missing peer');
      return load.call(this, id, ...args);
    };
    const { default: plugin } = await import(${JSON.stringify(new URL('./plugin.ts', import.meta.url).href)});
    try {
      plugin.rules['no-conflicting-classes'].create({ options: [] });
      process.exitCode = 1;
    } catch (error) {
      process.stdout.write(error.message);
    }
  `;
  const output = execFileSync(
    process.execPath,
    ['--import=tsx/esm', '--input-type=module', '-e', script],
    { encoding: 'utf8' },
  );
  assert.match(output, /no-conflicting-classes.*requires.*tailwind-merge/);
  assert.match(output, /pnpm add -D tailwind-merge/);
});

test('plugin exports', async (t) => {
  await t.test('exposes both rules', () => {
    assert.ok('no-arbitrary-canonical' in plugin.rules);
    assert.ok('no-conflicting-classes' in plugin.rules);
  });

  await t.test(
    'recommended config only activates no-arbitrary-canonical',
    () => {
      const rules = plugin.configs.recommended.rules;
      assert.ok('tailwind-canonical/no-arbitrary-canonical' in rules);
      assert.ok(!('tailwind-canonical/no-conflicting-classes' in rules));
    },
  );

  await t.test('recommended config uses flat-config plugin shape', () => {
    assert.strictEqual(
      plugin.configs.recommended.plugins['tailwind-canonical'],
      plugin,
    );
  });
});

test('real ESLint contexts preserve unrelated source and partial classes', () => {
  const linter = new Linter();
  const config = [
    {
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { canonical: plugin },
      rules: {
        'canonical/no-arbitrary-canonical': 'error',
        'canonical/no-conflicting-classes': 'error',
      },
    },
  ] as const;
  for (const source of [
    'const message = "Hello  world";',
    'const query = "SELECT size-[12px] FROM styles";',
    'const node = <div title="size-[12px]" />;',
    'const classes = cn(fetch("size-[12px]"));',
    'const classes = cn({ x: flag === "p-[16px]" });',
    'const classes = cn({ x: "p-[16px]" });',
    'const classes = cn("p-[16px]" && "block");',
    'const classes = cva("block", { defaultVariants: { size: "p-[16px]" } });',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source fixture.
    'const node = <div className={`size-[12px]${suffix}`} />;',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source fixture.
    'const node = <div className={`${prefix}size-[12px]`} />;',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source fixture.
    'const node = <div className={`p-4 p-2${suffix}`} />;',
    'const node = <div className={String.raw`size-[12px]`} />;',
    'const node = <div className="leading-6 text-[13px]" />;',
  ]) {
    const result = linter.verifyAndFix(source, config);
    assert.deepEqual(result.messages, [], source);
    assert.strictEqual(result.output, source);
  }
  for (const [source, expected] of [
    [
      'const node = <div className="size-[12px]" />;',
      'const node = <div className="size-3" />;',
    ],
    [
      'const classes = cn("size-[12px]", ["p-[16px]"]);',
      'const classes = cn("size-3", ["p-4"]);',
    ],
    [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source fixture.
      'const node = <div className={`p-4 p-2 ${suffix} size-[12px]`} />;',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source fixture.
      'const node = <div className={`p-2 ${suffix} size-3`} />;',
    ],
    [
      'const classes = clsx({ "size-[12px]": active });',
      'const classes = clsx({ "size-3": active });',
    ],
    [
      'const classes = cn(value === "p-[16px]" && "px-[16px]");',
      'const classes = cn(value === "p-[16px]" && "px-4");',
    ],
    [
      'const classes = cn({"p-[16px]": "size-[12px]"});',
      'const classes = cn({"p-4": "size-[12px]"});',
    ],
    [
      'const classes = cva("p-[16px]", { variants: { size: { small: "size-[12px]" } }, compoundVariants: [{ size: "size-[12px]", class: "p-[16px]" }] });',
      'const classes = cva("p-4", { variants: { size: { small: "size-3" } }, compoundVariants: [{ size: "size-[12px]", class: "p-4" }] });',
    ],
  ]) {
    const result = linter.verifyAndFix(source, config);
    assert.deepEqual(result.messages, [], source);
    assert.strictEqual(result.output, expected);
  }
});

test('real ESLint accepts the entire shared Config and custom contexts', () => {
  const result = new Linter().verifyAndFix('const classes = tw("p-[16px]");', [
    {
      plugins: { canonical: plugin },
      rules: {
        'canonical/no-arbitrary-canonical': [
          'error',
          {
            functionNames: ['tw'],
            attributeNames: ['class'],
            extraColors: ['brand'],
            extraColorFamilies: { brand: 'blue' },
            extraScaleProperties: ['custom'],
            analyze: { maxPatterns: 4 },
            minRareScalePropertyOccurrences: 4,
            rareScaleMaxFiles: 1,
            rareScaleMaxCount: 2,
            defaultCommand: { fix: true },
          },
        ],
      },
    },
  ]);
  assert.deepEqual(result.messages, []);
  assert.strictEqual(result.output, 'const classes = tw("p-4");');
});

test('conflict rule honors custom class contexts and preserves custom text leading', () => {
  const result = new Linter().verifyAndFix(
    'const x = tw("p-2 p-4 leading-6 text-tiny");',
    [
      {
        plugins: { canonical: plugin },
        rules: {
          'canonical/no-conflicting-classes': [
            'error',
            {
              functionNames: ['tw'],
              customTextTokens: { 11: 'tiny' },
            },
          ],
        },
      },
    ],
  );
  assert.deepEqual(result.messages, []);
  assert.strictEqual(result.output, 'const x = tw("p-4 leading-6 text-tiny");');
});

test('rule options reject malformed regular expressions with a clear error', () => {
  assert.throws(
    () =>
      new Linter().verify('const x = cn("p-[16px]");', [
        {
          plugins: { canonical: plugin },
          rules: {
            'canonical/no-arbitrary-canonical': [
              'error',
              { ignorePatterns: ['p-'] },
            ],
          },
        },
      ]),
    /ignorePatterns.*RegExp/,
  );
});

test('rule options support disabling default-theme mappings', () => {
  for (const [options, expected] of [
    [{ useDefaultTheme: false }, 'const x = cn("text-[12px]");'],
    [
      {
        useDefaultTheme: false,
        allowTextSizeLineHeightChanges: true,
        customTextTokens: { 12: 'tiny' },
      },
      'const x = cn("text-tiny");',
    ],
  ] as const) {
    const result = new Linter().verifyAndFix('const x = cn("text-[12px]");', [
      {
        plugins: { canonical: plugin },
        rules: { 'canonical/no-arbitrary-canonical': ['error', options] },
      },
    ]);
    assert.deepEqual(result.messages, []);
    assert.strictEqual(result.output, expected);
  }
});

test('object key rewrites preserve predicates and computed CVA options', () => {
  const configs = [
    {
      plugins: { canonical: plugin },
      rules: {
        'canonical/no-arbitrary-canonical': 'error',
        'canonical/no-conflicting-classes': 'error',
      },
    },
  ] as const;
  for (const input of [
    'cn({"p-[16px]": enabled, "p-4": other})',
    'cn({"p-2 p-4": enabled, "p-4": other})',
    'cn({"p-[16px]": enabled, ...other})',
    'cva("flex", {[variants]: {size: {sm: "size-[12px]"}}})',
  ]) {
    const result = new Linter().verifyAndFix(input, configs);
    assert.deepEqual(result.messages, []);
    assert.strictEqual(result.output, input);
  }
});

test('template autofixes use source ranges even when CRLF is normalized in raw values', () => {
  const config = [
    {
      plugins: { canonical: plugin },
      rules: {
        'canonical/no-arbitrary-canonical': 'error',
      },
    },
  ] as const;
  for (const input of [
    'cn(`p-[16px]\r\nflex`)',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source fixture.
    'cn(`p-[16px]\r\nflex ${suffix} size-[12px]`)',
  ]) {
    const result = new Linter().verifyAndFix(input, config);
    assert.deepEqual(result.messages, []);
    assert.strictEqual(
      result.output,
      input
        .replace('p-[16px]', 'p-4')
        .replace('size-[12px]', 'size-3')
        .replaceAll('\r\n', '\n'),
    );
  }
});

test('default font-size rules preserve line-height semantics without diagnostics or fixes', () => {
  for (const options of [
    {},
    { allowTextSizeLineHeightChanges: false },
    { customTextTokens: { 12: 'tiny' } },
  ]) {
    const configs = [
      {
        plugins: { canonical: plugin },
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { 'canonical/no-arbitrary-canonical': ['error', options] },
      },
    ];
    for (const source of [
      'cn("text-[12px]")',
      'cn("text-[0.75rem]")',
      'cn("leading-6 text-[12px]")',
      'cn("sm:!text-[12px] sm:leading-6")',
      '<div className="hover:text-[1rem]! leading-none" />',
    ]) {
      const result = new Linter().verifyAndFix(source, configs);
      assert.deepEqual(result.messages, [], source);
      assert.strictEqual(result.fixed, false, source);
      assert.strictEqual(result.output, source);
    }
    const source = 'cn("text-[12px] p-[16px] hover:text-[1rem]!")';
    const messages = new Linter().verify(source, configs);
    assert.strictEqual(messages.length, 1);
    assert.match(messages[0].message, /p-4/);
    const result = new Linter().verifyAndFix(source, configs);
    assert.deepEqual(result.messages, []);
    assert.strictEqual(
      result.output,
      'cn("text-[12px] p-4 hover:text-[1rem]!")',
    );
  }
});

test('font-size transformations require an explicit line-height opt-in', () => {
  for (const [options, source, expected] of [
    [
      { allowTextSizeLineHeightChanges: true },
      'cn("text-[12px] p-[16px]")',
      'cn("text-xs p-4")',
    ],
    [
      { allowTextSizeLineHeightChanges: true },
      'cn("sm:!text-[0.75rem] leading-6")',
      'cn("sm:!text-xs leading-6")',
    ],
    [
      {
        allowTextSizeLineHeightChanges: true,
        customTextTokens: { 12: 'tiny' },
      },
      'cn("hover:text-[12px]!")',
      'cn("hover:text-tiny!")',
    ],
  ]) {
    const result = new Linter().verifyAndFix(source, [
      {
        plugins: { canonical: plugin },
        rules: { 'canonical/no-arbitrary-canonical': ['error', options] },
      },
    ]);
    assert.deepEqual(result.messages, []);
    assert.strictEqual(result.fixed, true);
    assert.strictEqual(result.output, expected);
  }
});
