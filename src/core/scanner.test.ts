import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveTargets, scanFiles } from './scanner.js';

function makeTmpTree(): string {
  const root = join(tmpdir(), `scanner-test-${Date.now()}`);
  mkdirSync(join(root, 'src/components'), { recursive: true });
  mkdirSync(join(root, 'src/pages'), { recursive: true });
  mkdirSync(join(root, 'src/utils'), { recursive: true });
  mkdirSync(join(root, 'src/generated'), { recursive: true });
  mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
  writeFileSync(join(root, 'src/App.tsx'), '');
  writeFileSync(join(root, 'src/index.ts'), '');
  writeFileSync(join(root, 'src/components/Button.tsx'), '');
  writeFileSync(join(root, 'src/components/Input.tsx'), '');
  writeFileSync(join(root, 'src/pages/Home.tsx'), '');
  writeFileSync(join(root, 'src/utils/format.ts'), '');
  writeFileSync(join(root, 'src/utils/README.md'), '');
  writeFileSync(join(root, 'src/generated/schema.ts'), '');
  writeFileSync(join(root, 'node_modules/pkg/index.tsx'), '');
  return root;
}

test('resolveTargets - glob patterns', async (t) => {
  const root = makeTmpTree();
  const rel = (f: string) => f.replace(`${root}/`, '');

  await t.test('** matches all tsx files under src/', async () => {
    const files = await resolveTargets([`${root}/src/**/*.tsx`]);
    const names = files.map(rel);
    assert.ok(names.includes('src/App.tsx'));
    assert.ok(names.includes('src/components/Button.tsx'));
    assert.ok(names.includes('src/components/Input.tsx'));
    assert.ok(names.includes('src/pages/Home.tsx'));
    assert.ok(!names.includes('src/index.ts'));
    assert.ok(!names.includes('src/utils/README.md'));
  });

  await t.test('brace expansion {tsx,ts} matches both extensions', async () => {
    const files = await resolveTargets([`${root}/src/**/*.{tsx,ts}`]);
    const names = files.map(rel);
    assert.ok(names.includes('src/App.tsx'));
    assert.ok(names.includes('src/index.ts'));
    assert.ok(names.includes('src/utils/format.ts'));
    assert.ok(!names.includes('src/utils/README.md'));
  });

  await t.test('single * matches only direct children', async () => {
    const files = await resolveTargets([`${root}/src/components/*.tsx`]);
    const names = files.map(rel);
    assert.ok(names.includes('src/components/Button.tsx'));
    assert.ok(names.includes('src/components/Input.tsx'));
    assert.ok(!names.includes('src/App.tsx'));
    assert.ok(!names.includes('src/pages/Home.tsx'));
  });

  await t.test('negation pattern excludes matched files', async () => {
    const files = await resolveTargets([
      `${root}/src/**/*.ts`,
      `!${root}/src/generated/**`,
    ]);
    const names = files.map(rel);
    assert.ok(names.includes('src/index.ts'));
    assert.ok(names.includes('src/utils/format.ts'));
    assert.ok(!names.includes('src/generated/schema.ts'));
  });

  await t.test('ignores node_modules', async () => {
    const files = await resolveTargets([`${root}/**/*.tsx`]);
    const names = files.map(rel);
    assert.ok(!names.some((n) => n.startsWith('node_modules/')));
  });

  await t.test('returns empty for nonexistent glob base', async () => {
    const files = await resolveTargets([`${root}/nonexistent/**/*.tsx`]);
    assert.deepStrictEqual(files, []);
  });

  await t.test('? wildcard matches single character', async () => {
    const files = await resolveTargets([`${root}/src/utils/forma?.ts`]);
    const names = files.map(rel);
    assert.ok(names.includes('src/utils/format.ts'));
  });

  await t.test('multiple positive patterns are combined', async () => {
    const files = await resolveTargets([
      `${root}/src/components/*.tsx`,
      `${root}/src/pages/*.tsx`,
    ]);
    const names = files.map(rel);
    assert.ok(names.includes('src/components/Button.tsx'));
    assert.ok(names.includes('src/pages/Home.tsx'));
    assert.ok(!names.includes('src/App.tsx'));
  });

  rmSync(root, { recursive: true, force: true });
});

test('scanFiles - directory and file targets', async (t) => {
  const root = makeTmpTree();

  await t.test('directory target returns all matching extensions', () => {
    const files = scanFiles(`${root}/src`);
    assert.ok(files.length >= 6);
    assert.ok(files.every((f) => /\.(tsx|ts|jsx|js|vue|svelte)$/.test(f)));
  });

  await t.test('single file target returns that file', () => {
    const target = join(root, 'src/App.tsx');
    const files = scanFiles(target);
    assert.deepStrictEqual(files, [target]);
  });

  await t.test('single non-matching file returns empty', () => {
    const target = join(root, 'src/utils/README.md');
    const files = scanFiles(target);
    assert.deepStrictEqual(files, []);
  });

  rmSync(root, { recursive: true, force: true });
});
