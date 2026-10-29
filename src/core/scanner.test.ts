import assert from 'node:assert';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixFile } from './fixer.js';
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

  await t.test(
    'character classes and extglobs use the same grammar in exclusions',
    async () => {
      for (const pattern of ['[BI]*.tsx', '@(Button|Input).tsx']) {
        const positive = await resolveTargets([
          `${root}/src/components/${pattern}`,
        ]);
        assert.strictEqual(positive.length, 2);
        const remaining = await resolveTargets([
          `${root}/src/components`,
          `!${root}/src/components/${pattern}`,
        ]);
        assert.deepStrictEqual(remaining, []);
      }
    },
  );

  await t.test(
    'glob results contain files rather than directories with source extensions',
    async () => {
      mkdirSync(join(root, 'src/directory.tsx'));
      const files = await resolveTargets([`${root}/src/**/*.tsx`]);
      assert.ok(!files.includes(join(root, 'src/directory.tsx')));
    },
  );

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

  await t.test('globstar exclusions match whole path segments', async () => {
    const directory = join(root, 'src/globstar');
    mkdirSync(join(directory, 'nested'), { recursive: true });
    for (const file of [
      'foo.ts',
      'afoo.ts',
      'nested/foo.ts',
      'nested/afoo.ts',
    ]) {
      writeFileSync(join(directory, file), '');
    }

    const pattern = `${directory}/**/foo.ts`;
    const included = await resolveTargets([pattern]);
    const remaining = await resolveTargets([directory, `!${pattern}`]);
    assert.deepStrictEqual(included, [
      join(directory, 'foo.ts'),
      join(directory, 'nested/foo.ts'),
    ]);
    assert.deepStrictEqual(remaining, [
      join(directory, 'afoo.ts'),
      join(directory, 'nested/afoo.ts'),
    ]);
    assert.deepStrictEqual(
      await resolveTargets([directory, '!**/foo.ts']),
      remaining,
    );
  });

  await t.test('negation with wildcards inside braces', async () => {
    const files = await resolveTargets([
      `${root}/src/**/*.ts`,
      `!${root}/src/{generated/*.ts,utils/f?rmat.ts}`,
    ]);
    const names = files.map(rel);
    assert.ok(names.includes('src/index.ts'));
    assert.ok(!names.includes('src/utils/format.ts'));
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

  await t.test('relative negation pattern works', async () => {
    const files = await resolveTargets([
      `${root}/src/**/*.ts`,
      '!**/generated/**',
    ]);
    const names = files.map(rel);
    assert.ok(names.includes('src/index.ts'));
    assert.ok(!names.includes('src/generated/schema.ts'));
  });

  await t.test('glob mode filters by extensions', async () => {
    writeFileSync(join(root, 'src/data.json'), '{}');
    const files = await resolveTargets([`${root}/src/**/*`]);
    const names = files.map(rel);
    assert.ok(names.includes('src/App.tsx'));
    assert.ok(!names.includes('src/utils/README.md'));
    assert.ok(!names.includes('src/data.json'));
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

  await t.test('glob mode honors custom options.extensions', async () => {
    writeFileSync(join(root, 'src/notes.md'), '# notes');
    const files = await resolveTargets([`${root}/src/**/*`], {
      extensions: ['.md'],
    });
    const names = files.map(rel);
    assert.ok(names.includes('src/notes.md'));
    assert.ok(names.includes('src/utils/README.md'));
    assert.ok(!names.includes('src/App.tsx'));
    assert.ok(!names.includes('src/index.ts'));
  });

  await t.test('glob mode honors custom options.ignore', async () => {
    const files = await resolveTargets([`${root}/src/**/*.tsx`], {
      ignore: ['components'],
    });
    const names = files.map(rel);
    assert.ok(names.includes('src/App.tsx'));
    assert.ok(names.includes('src/pages/Home.tsx'));
    assert.ok(!names.includes('src/components/Button.tsx'));
    assert.ok(!names.includes('src/components/Input.tsx'));
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

test('discovery skips symlinks outside the target while explicit file links remain supported', async () => {
  const root = makeTmpTree();
  const external = `${root}-outside.tsx`;
  const link = join(root, 'src/external.tsx');
  const content = '<div className="h-[12px]" />';
  try {
    writeFileSync(external, content);
    symlinkSync(external, link);
    const scanned = scanFiles(join(root, 'src'));
    const globbed = await resolveTargets([`${root}/src/**/*.tsx`]);
    assert.ok(!scanned.includes(link));
    assert.ok(!globbed.includes(link));
    for (const file of new Set([...scanned, ...globbed])) fixFile(file);
    assert.strictEqual(readFileSync(external, 'utf8'), content);
    assert.deepStrictEqual(scanFiles(link), [link]);
    assert.deepStrictEqual(await resolveTargets([link]), [link]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { force: true });
  }
});

test('existing bracketed route paths take precedence over glob syntax, including exclusions', async () => {
  const root = makeTmpTree();
  const route = join(root, 'app', '[locale]');
  const decoy = join(root, 'app', 'l', 'page.tsx');
  const page = join(route, 'page.tsx');
  try {
    mkdirSync(route, { recursive: true });
    mkdirSync(join(root, 'app', 'l'), { recursive: true });
    writeFileSync(page, '<div className="h-[12px]" />');
    writeFileSync(decoy, '<div className="p-[16px]" />');
    assert.deepStrictEqual(await resolveTargets([page]), [page]);
    assert.deepStrictEqual(await resolveTargets([route]), [page]);
    assert.deepStrictEqual(
      await resolveTargets([join(root, 'app'), `!${page}`]),
      [decoy],
    );
    assert.deepStrictEqual(
      await resolveTargets([join(root, 'app'), `!${route}`]),
      [decoy],
    );
    for (const file of await resolveTargets([page])) fixFile(file);
    assert.strictEqual(readFileSync(page, 'utf8'), '<div className="h-3" />');
    assert.strictEqual(
      readFileSync(decoy, 'utf8'),
      '<div className="p-[16px]" />',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discovery reports unreadable directories instead of silently skipping their files', async (t) => {
  if (process.getuid?.() === 0)
    return t.skip('root bypasses directory permissions');
  const root = makeTmpTree();
  const blocked = join(root, 'src/components');
  try {
    chmodSync(blocked, 0);
    assert.throws(() => scanFiles(join(root, 'src')), { code: 'EACCES' });
    await assert.rejects(resolveTargets([join(root, 'src')]), {
      code: 'EACCES',
    });
    await assert.rejects(resolveTargets([join(root, 'src/**/*.tsx')]), {
      code: 'EACCES',
    });
    assert.throws(() => scanFiles(join(blocked, 'Button.tsx')), {
      code: 'EACCES',
    });
  } finally {
    chmodSync(blocked, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test('discovery still treats missing paths and non-directory ancestors as no match', async () => {
  const root = makeTmpTree();
  try {
    assert.deepStrictEqual(scanFiles(join(root, 'missing.tsx')), []);
    assert.deepStrictEqual(
      await resolveTargets([join(root, 'src/App.tsx/child.tsx')]),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('repeated scans retain literal and glob identities after filesystem changes', async () => {
  const root = makeTmpTree();
  const route = join(root, 'app', '[locale]');
  const page = join(route, 'page.tsx');
  const decoy = join(root, 'app', 'l', 'page.tsx');
  try {
    mkdirSync(route, { recursive: true });
    mkdirSync(join(root, 'app', 'l'), { recursive: true });
    writeFileSync(page, '');
    writeFileSync(decoy, '');
    const options = {
      targetKinds: new Map([[page.replace(/\\/g, '/'), 'literal' as const]]),
    };
    assert.deepStrictEqual(await resolveTargets([page], options), [page]);
    rmSync(page);
    assert.deepStrictEqual(await resolveTargets([page], options), []);
    assert.deepStrictEqual(
      await resolveTargets([join(root, 'app'), `!${page}`], options),
      [decoy],
    );
    writeFileSync(page, '');
    assert.deepStrictEqual(await resolveTargets([page], options), [page]);

    const glob = join(root, 'app', '[ab]', 'page.tsx');
    const match = join(root, 'app', 'a', 'page.tsx');
    mkdirSync(join(root, 'app', 'a'), { recursive: true });
    writeFileSync(match, '');
    const globOptions = {
      targetKinds: new Map([[glob.replace(/\\/g, '/'), 'glob' as const]]),
    };
    assert.deepStrictEqual(await resolveTargets([glob], globOptions), [match]);
    mkdirSync(join(root, 'app', '[ab]'), { recursive: true });
    writeFileSync(glob, '');
    assert.deepStrictEqual(await resolveTargets([glob], globOptions), [match]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
