import assert from 'node:assert';
import { test } from 'node:test';
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

function literal(value: string, raw = `"${value}"`) {
  return { type: 'Literal' as const, value, raw };
}

test('no-arbitrary-canonical rule', async (t) => {
  await t.test('reports text-[12px] with canonical text-xs', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('text-[12px]'));
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('text-xs'));
  });

  await t.test('reports nothing for plain text-xs', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('text-xs'));
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
        literal('text-[12px] h-[64px] flex'),
      );
      assert.strictEqual(reports.length, 1);
      assert.ok(JSON.stringify(reports[0]).includes('text-xs h-16'));
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
    const node = literal('text-[12px]');
    (rule.Literal as (n: unknown) => void)(node);
    assert.ok(reports[0].fix);
    const result = reports[0].fix?.({ replaceText: (_n, s) => s });
    assert.ok((result as string).includes('text-xs'));
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
      literal('text-[12px] flex h-[64px]'),
    );
    assert.strictEqual(reports.length, 1);
    const result = reports[0].fix?.({ replaceText: (_n, s) => s });
    assert.strictEqual(result, '"text-xs flex h-16"');
  });

  await t.test('respects customTextTokens from config', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{ customTextTokens: { 11: 'tiny' } }] as [object],
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
      options: [{ ignorePatterns: [/^text-/] }] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.Literal as (n: unknown) => void)(literal('text-[12px] h-[64px]'));
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
    ]) {
      assert.ok(key in props, `schema should declare ${key}`);
    }
    const ctx = {
      options: [
        {
          functionNames: ['cn'],
          attributeNames: ['class'],
          sortOrder: ['display'],
          ignorePatterns: [/^z-/],
        },
      ] as [object],
      report: () => undefined,
    };
    assert.doesNotThrow(() => noArbitraryCanonical.create(ctx as never));
  });

  await t.test(
    'honors ignorePatterns and no-ops CLI-only keys from a shared config',
    () => {
      const reports: unknown[] = [];
      const ctx = {
        options: [
          {
            functionNames: ['cn'],
            attributeNames: ['class'],
            sortOrder: ['display'],
            ignorePatterns: [/^text-/],
          },
        ] as [object],
        report: (d: unknown) => reports.push(d),
      };
      const rule = noArbitraryCanonical.create(ctx as never);
      (rule.Literal as (n: unknown) => void)(literal('text-[12px] h-[64px]'));
      assert.strictEqual(reports.length, 1);
      assert.ok(JSON.stringify(reports[0]).includes('h-16'));
      assert.ok(!JSON.stringify(reports[0]).includes('text-xs'));
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
    quasis,
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
      templateLiteral('text-[12px] flex'),
    );
    assert.strictEqual(reports.length, 1);
    assert.ok(JSON.stringify(reports[0]).includes('text-xs'));
  });

  await t.test('walks every quasi of a multi-part template', () => {
    const reports: unknown[] = [];
    const ctx = {
      options: [{}] as [object],
      report: (d: unknown) => reports.push(d),
    };
    const rule = noArbitraryCanonical.create(ctx as never);
    (rule.TemplateLiteral as (n: unknown) => void)(
      templateLiteral('text-[12px] ', ' h-[64px]'),
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
        [templateLiteral('text-[12px] flex'), '`text-xs flex`'],
        [
          templateLiteral('p-2 text-[12px]', ' flex'),
          `\`p-2 text-xs${interp} flex\``,
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
});

test('no-conflicting-classes - twMerge peer is wired (peerMissing branch is false when installed)', () => {
  // tailwind-merge is installed in this repo, so create() resolves twMerge and
  // does NOT set peerMissing. This locks in that the rule activates rather than
  // silently no-opping. The peerMissing early-return only triggers when the
  // optional peer dep is absent, which cannot be reproduced while it is installed.
  const reports: unknown[] = [];
  const rule = noConflictingClasses.create(makeContext(reports) as never);
  (rule.Literal as (n: unknown) => void)(literal('p-2 p-4'));
  assert.strictEqual(reports.length, 1);
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
});
