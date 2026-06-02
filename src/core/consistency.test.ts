import assert from 'node:assert';
import { type TestContext, test } from 'node:test';
import {
  analyzeConsistency,
  type ColorVariantGroup,
  collectClasses,
  type FileClasses,
  type ScaleInconsistency,
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

test('scale inconsistency - below threshold not reported', (_t: TestContext) => {
  const input: FileClasses[] = [
    { file: 'a.tsx', classes: ['gap-2'] },
    { file: 'b.tsx', classes: ['gap-4'] },
  ];
  const report = analyzeConsistency(input, { minScaleOccurrences: 3 });
  assert.strictEqual(scaleOf(report, 'gap'), undefined);
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
