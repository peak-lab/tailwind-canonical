import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compilers and their CSS parser stay outside this repository and its lockfile.
// This oracle checks simple equal-specificity utilities, not arbitrary CSS.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'tailwind-canonical-css-'));
function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });
  } catch (error) {
    if (error.stdout) process.stderr.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

function decodeClassSelector(selector) {
  return selector.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex, char) =>
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : char,
  );
}

function normalizeValue(value) {
  const variables = {
    '--spacing': '4px',
    '--radius-lg': '8px',
    '--text-xs': '12px',
  };
  let result = value.replace(
    /var\((--[\w-]+)\)/g,
    (raw, name) => variables[name] ?? raw,
  );
  result = result.replace(
    /(-?\d+(?:\.\d+)?)rem\b/g,
    (_, rem) => `${Number(rem) * 16}px`,
  );
  return result.replace(
    /calc\((-?\d+(?:\.\d+)?)px\s*\*\s*(-?\d+(?:\.\d+)?)\)/g,
    (_, length, factor) => `${Number(length) * Number(factor)}px`,
  );
}

function physicalDeclarations(property, value, vertical) {
  const sides = ['top', 'right', 'bottom', 'left'];
  const axis = (name) =>
    name === 'inline'
      ? vertical
        ? ['top', 'bottom']
        : ['left', 'right']
      : vertical
        ? ['left', 'right']
        : ['top', 'bottom'];
  const box = property.match(
    /^(padding|margin|inset|scroll-padding|scroll-margin)(?:-(inline|block))?$/,
  );
  if (box) {
    const prefix = box[1] === 'inset' ? '' : `${box[1]}-`;
    return (box[2] ? axis(box[2]) : sides).map((side) => [
      `${prefix}${side}`,
      value,
    ]);
  }
  const border = property.match(/^border(?:-(inline|block))?-(width|style)$/);
  if (border)
    return (border[1] ? axis(border[1]) : sides).map((side) => [
      `border-${side}-${border[2]}`,
      value,
    ]);
  if (property === 'border-radius')
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(
      (corner) => [`border-${corner}-radius`, value],
    );
  return [[property, value]];
}

// Source order comes from the compiler, not the order of class tokens. All
// fixtures use ordinary class selectors without variants or competing layers.
function cascade(stylesheet, classList, vertical = false) {
  const classes = new Set(classList.split(/\s+/).filter(Boolean));
  const declarations = new Map();
  stylesheet.walkRules((rule) => {
    const selector = decodeClassSelector(rule.selector);
    if (!(selector.startsWith('.') && classes.has(selector.slice(1)))) return;
    rule.walkDecls((declaration) => {
      for (const [property, value] of physicalDeclarations(
        declaration.prop,
        normalizeValue(declaration.value),
        vertical,
      )) {
        const previous = declarations.get(property);
        if (!previous?.important || declaration.important) {
          declarations.set(property, {
            value,
            important: Boolean(declaration.important),
          });
        }
      }
    });
  });
  return Object.fromEntries(
    [...declarations].sort(([a], [b]) => a.localeCompare(b)),
  );
}

const prefixes = [
  'h',
  'w',
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
  'gap-x',
  'gap-y',
  'top',
  'left',
  'right',
  'bottom',
  'inset',
  'size',
  'min-h',
  'max-h',
  'min-w',
  'max-w',
  'translate-x',
  'translate-y',
  'space-x',
  'space-y',
  'leading',
  'basis',
  'rounded',
  'rounded-t',
  'rounded-tl',
  'rounded-s',
  'rounded-ss',
  'border',
  'border-x',
  'border-s',
  'divide-x',
  'ring',
  'outline',
  'z',
  'order',
  'line-clamp',
  'columns',
  'grow',
  'shrink',
  'opacity',
  'scale',
  'scale-x',
  'rotate',
  'blur',
  'aspect',
  'duration',
  'delay',
];
const values = [
  '0',
  '1',
  '2',
  '4',
  '12',
  '16',
  '100',
  '0px',
  '1px',
  '2px',
  '4px',
  '12px',
  '16px',
  '9999px',
  '0.5rem',
  '1rem',
  '50%',
  '25%',
  '33.33%',
  '100%',
  '100vw',
  '100vh',
  '100dvh',
  'auto',
  'fit-content',
  'min-content',
  'max-content',
  '1.5',
  '700',
  '1.05',
  '100ms',
  '0.2s',
  '45deg',
  '16/9',
];

try {
  run('pnpm', ['build'], root);
  writeFileSync(
    join(temporary, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      'tailwindcss3@npm:tailwindcss@3.3.7',
      'tailwindcss4@npm:tailwindcss@4.3.3',
      'postcss@8.5.6',
    ],
    temporary,
  );
  const require = createRequire(join(temporary, 'package.json'));
  const postcss = require('postcss');
  const tailwind3 = require('tailwindcss3');
  const tailwind4 = require('tailwindcss4');
  const theme = readFileSync(require.resolve('tailwindcss4/theme.css'), 'utf8');
  const { suggestCanonical } = await import('../dist/core/rules.js');
  const { fixContent } = await import('../dist/core/fixer.js');
  const { deduplicateClasses } = await import('../dist/core/deduplicator.js');
  const { mergeClasses } = await import('../dist/core/merger.js');
  const { twMerge } = await import('tailwind-merge');

  for (const version of [3, 4]) {
    async function compile(classes) {
      const candidates = [...new Set(classes)];
      if (version === 3) {
        const result = await postcss([
          tailwind3({
            content: [{ raw: candidates.join(' ') }],
            corePlugins: { preflight: false },
          }),
        ]).process('@tailwind utilities;', { from: undefined });
        return result.root;
      }
      const compiler = await tailwind4.compile(
        `${theme}\n@tailwind utilities;`,
      );
      return postcss.parse(compiler.build(candidates));
    }

    const suggestions = prefixes.flatMap((prefix) =>
      values.flatMap((value) =>
        ['', '-'].flatMap((sign) => {
          const suggestion = suggestCanonical(`${sign}${prefix}-[${value}]`, {
            tailwindVersion: version,
          });
          return suggestion ? [suggestion] : [];
        }),
      ),
    );
    const validity = await compile(
      suggestions.flatMap(({ original, canonical }) => [original, canonical]),
    );
    const compiled = new Set();
    validity.walkRules((rule) =>
      compiled.add(decodeClassSelector(rule.selector)),
    );
    const hasClass = (candidate) =>
      [...compiled].some(
        (selector) =>
          selector === `.${candidate}` ||
          selector.startsWith(`.${candidate} > `),
      );
    let checked = 0;
    for (const { original, canonical } of suggestions) {
      if (!hasClass(original)) continue;
      assert.ok(
        hasClass(canonical),
        `Tailwind ${version}: ${original} becomes missing utility ${canonical}`,
      );
      checked++;
    }
    assert.ok(
      checked > 400,
      'The validity matrix must exercise the supported utility families',
    );

    const lineHeight = await compile(['leading-[1px]', 'leading-px']);
    assert.equal(
      cascade(lineHeight, 'leading-[1px]')['line-height'].value,
      '1px',
    );
    assert.equal(
      suggestCanonical('leading-[1px]', { tailwindVersion: version })
        ?.canonical ?? null,
      version === 3 ? null : 'leading-px',
    );
    if (version === 3) assert.deepEqual(cascade(lineHeight, 'leading-px'), {});

    for (const font of ['text-[12px]', 'text-[0.75rem]']) {
      const strictConfig = { tailwindVersion: version };
      const permissiveConfig = {
        ...strictConfig,
        allowTextSizeLineHeightChanges: true,
      };
      assert.equal(suggestCanonical(font, strictConfig), null);
      assert.equal(
        suggestCanonical(font, {
          ...strictConfig,
          allowTextSizeLineHeightChanges: false,
        }),
        null,
      );
      const opted = suggestCanonical(font, permissiveConfig);
      assert.equal(opted?.canonical, 'text-xs');
      const sheet = await compile([font, opted.canonical, 'leading-6']);
      const arbitrary = cascade(sheet, font);
      assert.deepEqual(arbitrary['font-size'], {
        value: '12px',
        important: false,
      });
      assert.equal(
        arbitrary['line-height'],
        undefined,
        `Tailwind ${version}: arbitrary font-size sets no line-height`,
      );
      const source = `<div className="${font}" />`;
      assert.equal(fixContent(source, strictConfig).result, source);
      const canonical = cascade(sheet, opted.canonical);
      assert.deepEqual(canonical['font-size'], arbitrary['font-size']);
      assert.ok(
        canonical['line-height'],
        `Tailwind ${version}: opt-in font-size token adds line-height`,
      );
      assert.notDeepEqual(
        canonical,
        arbitrary,
        'Opt-in must explicitly expose the additional line-height declaration',
      );
      const leadingSource = `<div className="leading-6 ${font}" />`;
      assert.equal(
        fixContent(leadingSource, strictConfig).result,
        leadingSource,
      );
      assert.equal(
        cascade(sheet, `leading-6 ${font}`)['line-height'].value,
        '24px',
      );
      assert.equal(
        fixContent(source, permissiveConfig).result,
        '<div className="text-xs" />',
      );
    }

    const important =
      version === 3 ? (token) => `!${token}` : (token) => `${token}!`;
    const dedupCases = [
      `${important('p-4')} p-8`,
      `${important('p-4')} px-4`,
      `${important('gap-4')} gap-8`,
      `${important('rounded-lg')} rounded-t-none`,
      'pl-4 pr-4',
      'pt-4 pb-4',
      'ml-4 mr-4',
      'left-4 right-4',
      'border-l-4 border-r-4',
      'scroll-pl-4 scroll-pr-4',
      'pl-4 pr-4 py-4',
      'px-4 pt-4 pb-4',
      'px-4 py-4',
      'pl-4 pr-4 pt-4 pb-4',
    ];
    for (const input of dedupCases) {
      const output = deduplicateClasses(input, { tailwindVersion: version });
      const stylesheet = await compile([
        ...input.split(' '),
        ...output.split(' '),
      ]);
      for (const vertical of version === 4 ? [false, true] : [false]) {
        assert.deepEqual(
          cascade(stylesheet, output, vertical),
          cascade(stylesheet, input, vertical),
          `Tailwind ${version}, vertical=${vertical}: dedup ${input} -> ${output}`,
        );
      }
    }
    const priority = await compile([important('p-4'), 'p-8']);
    assert.deepEqual(
      cascade(priority, `${important('p-4')} p-8`)['padding-left'],
      { value: '16px', important: true },
    );
    if (version === 4) {
      const logical = await compile(['pl-4', 'pr-4', 'px-4']);
      assert.notDeepEqual(
        cascade(logical, 'pl-4 pr-4', true),
        cascade(logical, 'px-4', true),
        'The CSS oracle must detect physical/logical differences in vertical writing',
      );
    }

    const sizes = [
      'text-[13px]',
      'text-[length:13px]',
      'text-[length:var(--size)]',
      'text-[calc(1rem+2px)]',
      'text-[120%]',
      'text-[clamp(1rem,2vw,2rem)]',
    ];
    if (version === 4) sizes.push('text-(length:--size)');
    for (const size of sizes) {
      const input = `${important('leading-6')} ${important(size)}`;
      const output = mergeClasses(input, twMerge);
      const stylesheet = await compile([
        ...input.split(' '),
        ...output.split(' '),
      ]);
      const original = cascade(stylesheet, input);
      assert.deepEqual(original['line-height'], {
        value: '24px',
        important: true,
      });
      assert.deepEqual(
        cascade(stylesheet, output),
        original,
        `Tailwind ${version}: merge must preserve explicit line-height in ${input}`,
      );
    }
    process.stdout.write(
      `PASS Tailwind ${version === 3 ? '3.3.7' : '4.3.3'}: ${checked} generated utilities, important priorities, physical/logical properties, explicit line-height, strict font-size defaults and opt-in side effects\n`,
    );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
