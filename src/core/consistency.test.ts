import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import {
  analyzeConsistency,
  analyzeConsistencyFiles,
  type ColorVariantGroup,
  collectClasses,
  type FileClasses,
  type ScaleInconsistency,
  toConsistencyOptions,
} from './consistency.js';

function colorGroup(
  report: ReturnType<typeof analyzeConsistency>,
  property: string,
  family: string,
): ColorVariantGroup | undefined {
  return report.colorVariants.find(
    (g) => g.property === property && g.family === family,
  );
}

function scaleOf(
  report: ReturnType<typeof analyzeConsistency>,
  property: string,
): ScaleInconsistency | undefined {
  return report.scaleInconsistencies.find((s) => s.property === property);
}

test('color variant grouping - same family across shades and colors', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['text-red-500'] },
    { file: 'b.tsx', classes: ['text-rose-500'] },
    { file: 'c.tsx', classes: ['text-red-600'] },
  ];
  const report = analyzeConsistency(input);
  const group = colorGroup(report, 'text', 'red');
  assert.ok(group, 'expected a text/red color group');
  assert.strictEqual(group.variants.length, 3);
  assert.deepEqual(group.variants.map((v) => v.token).sort(), [
    'red-500',
    'red-600',
    'rose-500',
  ]);
});

test('color variant grouping - single token is not flagged', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['text-red-500'] },
    { file: 'b.tsx', classes: ['text-red-500'] },
  ];
  const report = analyzeConsistency(input);
  assert.strictEqual(report.colorVariants.length, 0);
});

test('color variant grouping - different properties stay separate', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['text-red-500', 'bg-red-100'] },
    { file: 'b.tsx', classes: ['text-red-600', 'bg-red-200'] },
  ];
  const report = analyzeConsistency(input);
  assert.ok(colorGroup(report, 'text', 'red'));
  assert.ok(colorGroup(report, 'bg', 'red'));
});

test('color variant grouping - variant counts and files aggregate', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['text-red-500', 'text-red-500'] },
    { file: 'b.tsx', classes: ['text-red-500'] },
    { file: 'c.tsx', classes: ['text-red-600'] },
  ];
  const report = analyzeConsistency(input);
  const group = colorGroup(report, 'text', 'red');
  assert.ok(group);
  const v500 = group.variants.find((v) => v.token === 'red-500');
  assert.strictEqual(v500?.count, 3);
  assert.deepEqual(v500?.files, ['a.tsx', 'b.tsx']);
});

test('color variant grouping - non-color and shadeless tokens ignored', (_t: TestContext) => {
  const input: FileClasses[] = [
    {
      file: 'a.tsx',
      classes: ['flex', 'text-white', 'bg-transparent', 'gap-4'],
    },
    { file: 'b.tsx', classes: ['text-black'] },
  ];
  const report = analyzeConsistency(input);
  assert.strictEqual(report.colorVariants.length, 0);
});

test('scale inconsistency - px-4 vs px-3 distribution', (_t: TestContext) => {
  const input: FileClasses[] = Array.from({ length: 8 }, (_, i) => ({
    file: `btn${i}.tsx`,
    classes: ['px-4', 'py-2'],
  })).concat([
    { file: 'x.tsx', classes: ['px-3', 'py-2'] },
    { file: 'y.tsx', classes: ['px-3', 'py-2'] },
  ]);
  const report = analyzeConsistency(input);
  const px = scaleOf(report, 'px');
  assert.ok(px, 'expected px inconsistency');
  assert.strictEqual(px.values[0].value, '4');
  assert.strictEqual(px.values[0].files.length, 8);
  assert.strictEqual(px.values[1].value, '3');
  assert.strictEqual(px.values[1].files.length, 2);
  assert.strictEqual(scaleOf(report, 'py'), undefined);
});

test('scale inconsistency - arbitrary z-index values', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['z-[100]'] },
    { file: 'b.tsx', classes: ['z-[200]'] },
    { file: 'c.tsx', classes: ['z-[50]'] },
  ];
  const report = analyzeConsistency(input);
  const z = scaleOf(report, 'z');
  assert.ok(z);
  assert.strictEqual(z.values.length, 3);
});

test('scale inconsistency - keyword values are not scale drift', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['mt-4'] },
    { file: 'b.tsx', classes: ['mt-auto'] },
  ];
  const report = analyzeConsistency(input, { minScaleOccurrences: 2 });
  assert.strictEqual(scaleOf(report, 'mt'), undefined);
});

test('scale inconsistency - arbitrary values still compared', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['z-[100]'] },
    { file: 'b.tsx', classes: ['z-[50]'] },
  ];
  const report = analyzeConsistency(input, { minScaleOccurrences: 2 });
  assert.ok(scaleOf(report, 'z'));
});

test('scale inconsistency - below threshold not reported', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['gap-2'] },
    { file: 'b.tsx', classes: ['gap-4'] },
  ];
  const report = analyzeConsistency(input, { minScaleOccurrences: 3 });
  assert.strictEqual(scaleOf(report, 'gap'), undefined);
});

test('color variants - custom colors ignored without config', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['text-brand-100'] },
    { file: 'b.tsx', classes: ['text-brand-200'] },
  ];
  assert.strictEqual(analyzeConsistency(input).colorVariants.length, 0);
});

test('color variants - extraColorFamilies groups custom colors', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['text-brand-100'] },
    { file: 'b.tsx', classes: ['text-brand-200'] },
  ];
  const report = analyzeConsistency(input, {
    extraColorFamilies: { brand: 'brand' },
  });
  const group = colorGroup(report, 'text', 'brand');
  assert.ok(group);
  assert.strictEqual(group.variants.length, 2);
});

test('toConsistencyOptions - maps config consistency fields', (_t: TestContext) => {
  assert.deepEqual(toConsistencyOptions(), {
    extraColorFamilies: undefined,
    extraScaleProperties: undefined,
    minRareScalePropertyOccurrences: undefined,
    rareScaleMaxFiles: undefined,
    rareScaleMaxCount: undefined,
  });
  assert.deepEqual(
    toConsistencyOptions({
      extraColorFamilies: { brand: 'brand' },
      extraScaleProperties: ['scroll-p'],
      minRareScalePropertyOccurrences: 20,
      rareScaleMaxFiles: 1,
      rareScaleMaxCount: 3,
    }),
    {
      extraColorFamilies: { brand: 'brand' },
      extraScaleProperties: ['scroll-p'],
      minRareScalePropertyOccurrences: 20,
      rareScaleMaxFiles: 1,
      rareScaleMaxCount: 3,
    },
  );
});

test('analyzeConsistencyFiles - config-derived options reach detectors', (_t: TestContext) => {
  const dir = join(tmpdir(), `twc-cons-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const a = join(dir, 'a.tsx');
  const b = join(dir, 'b.tsx');
  writeFileSync(a, '<div className="text-brand-100" />', 'utf8');
  writeFileSync(b, '<div className="text-brand-200" />', 'utf8');
  try {
    const config = { extraColorFamilies: { brand: 'brand' } };
    const report = analyzeConsistencyFiles(
      [a, b],
      config,
      toConsistencyOptions(config),
    );
    const group = colorGroup(report, 'text', 'brand');
    assert.ok(group);
    assert.strictEqual(group.variants.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scale inconsistency - extraScaleProperties extends detection', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['w-4'] },
    { file: 'b.tsx', classes: ['w-8'] },
    { file: 'c.tsx', classes: ['w-4'] },
  ];
  assert.strictEqual(scaleOf(analyzeConsistency(input), 'w'), undefined);
  const report = analyzeConsistency(input, { extraScaleProperties: ['w'] });
  assert.ok(scaleOf(report, 'w'));
});

test('scale inconsistency - variants stripped from prefix', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['hover:px-4'] },
    { file: 'b.tsx', classes: ['md:px-3'] },
    { file: 'c.tsx', classes: ['px-4'] },
  ];
  const report = analyzeConsistency(input);
  const px = scaleOf(report, 'px');
  assert.ok(px);
  assert.strictEqual(px.values[0].value, '4');
  assert.strictEqual(px.values[0].count, 2);
});

test('rare scale values - highlights low-frequency values in common properties', (_t: TestContext) => {
  const input: FileClasses[] = Array.from({ length: 12 }, (_, i) => ({
    file: `common-${i}.tsx`,
    classes: ['gap-2'],
  })).concat([
    { file: 'rare.tsx', classes: ['gap-24'] },
    { file: 'other.tsx', classes: ['gap-3'] },
  ]);
  const report = analyzeConsistency(input);
  assert.deepEqual(
    report.rareScaleValues.map((value) => value.className),
    ['gap-24', 'gap-3'],
  );
  assert.strictEqual(report.rareScaleValues[0].propertyCount, 14);
});

test('rare scale values - ignores tiny properties by default', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['my-1'] },
    { file: 'b.tsx', classes: ['my-2'] },
    { file: 'c.tsx', classes: ['my-1.5'] },
  ];
  const report = analyzeConsistency(input);
  assert.strictEqual(report.scaleInconsistencies.length, 1);
  assert.strictEqual(report.rareScaleValues.length, 0);
});

test('rare scale values - formats negative class names', (_t: TestContext) => {
  const input: FileClasses[] = Array.from({ length: 12 }, (_, i) => ({
    file: `common-${i}.tsx`,
    classes: ['mt-2'],
  })).concat([{ file: 'rare.tsx', classes: ['-mt-2'] }]);
  const report = analyzeConsistency(input);
  assert.strictEqual(report.rareScaleValues[0].value, '-2');
  assert.strictEqual(report.rareScaleValues[0].className, '-mt-2');
});

test('combinations - recurring class strings across files', (_t: TestContext) => {
  const combo = ['flex', 'items-center', 'gap-2'];
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: combo },
    { file: 'b.tsx', classes: combo },
    { file: 'c.tsx', classes: combo },
  ];
  const report = analyzeConsistency(input);
  assert.strictEqual(report.combinations.length, 1);
  assert.deepEqual(report.combinations[0].classes, [
    'flex',
    'gap-2',
    'items-center',
  ]);
  assert.strictEqual(report.combinations[0].files.length, 3);
});

test('combinations - below minFiles not reported', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['flex', 'gap-2'] },
    { file: 'b.tsx', classes: ['flex', 'gap-2'] },
  ];
  const report = analyzeConsistency(input, { minCombinationFiles: 3 });
  assert.strictEqual(report.combinations.length, 0);
});

test('combinations - order-insensitive grouping', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['flex', 'gap-2', 'items-center'] },
    { file: 'b.tsx', classes: ['items-center', 'flex', 'gap-2'] },
    { file: 'c.tsx', classes: ['gap-2', 'items-center', 'flex'] },
  ];
  const report = analyzeConsistency(input);
  assert.strictEqual(report.combinations.length, 1);
  assert.strictEqual(report.combinations[0].count, 3);
});

test('analyzeConsistency - reports filesAnalyzed count', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['flex'] },
    { file: 'b.tsx', classes: ['block'] },
  ];
  assert.strictEqual(analyzeConsistency(input).filesAnalyzed, 2);
});

test('collectClasses - extracts individual classes from className', (_t: TestContext) => {
  const content = '<div className="flex items-center gap-2">';
  assert.deepEqual(collectClasses(content), ['flex', 'items-center', 'gap-2']);
});

test('collectClasses - respects functionNames option', (_t: TestContext) => {
  const content = 'const x = cn("flex gap-2", cond && "px-4")';
  const classes = collectClasses(content, { functionNames: ['cn'] });
  assert.deepEqual(classes.sort(), ['flex', 'gap-2', 'px-4']);
});

test('analyzeConsistencyFiles - skips unreadable file and reports via onError', (_t: TestContext) => {
  const dir = join(tmpdir(), `twc-cons-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const good = join(dir, 'a.tsx');
  const missing = join(dir, 'does-not-exist.tsx');
  writeFileSync(good, '<div className="text-red-500 text-rose-600" />', 'utf8');
  const errors: string[] = [];
  try {
    const report = analyzeConsistencyFiles([good, missing], {}, {}, (file) =>
      errors.push(file),
    );
    assert.strictEqual(report.filesAnalyzed, 1);
    assert.deepEqual(errors, [missing]);
    assert.strictEqual(report.colorVariants.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
