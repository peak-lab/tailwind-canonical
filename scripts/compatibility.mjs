import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const matrix = [
  ['8.57.1', '2.6.1'],
  ['8.57.1', '3.7.0'],
  ['9.39.5', '2.6.1'],
  ['9.39.5', '3.7.0'],
  ['10.13.0', '2.6.1'],
  ['10.13.0', '3.7.0'],
  // Check the oldest advertised releases as well as each latest major.
  ['8.57.1', '2.0.0'],
  ['9.0.0', '3.0.0'],
  ['10.0.0', '3.0.0'],
];
const args = process.argv.slice(2);
if (args.length !== 0) {
  if (
    args.length !== 2 ||
    args.some((version) => !/^\d+\.\d+\.\d+$/.test(version))
  ) {
    throw new Error(
      'Usage: node scripts/compatibility.mjs [eslint-version tailwind-merge-version]',
    );
  }
  matrix.splice(0, matrix.length, args);
}

const temporary = mkdtempSync(join(tmpdir(), 'tailwind-canonical-compat-'));
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

try {
  run('pnpm', ['build'], root);
  const packed = JSON.parse(
    run(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary],
      root,
    ),
  )[0];
  const archive = join(temporary, packed.filename);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const standalone = mkdtempSync(join(temporary, 'standalone-'));
  writeFileSync(
    join(standalone, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--omit=peer',
      '--no-audit',
      '--no-fund',
      archive,
    ],
    standalone,
  );
  writeFileSync(
    join(standalone, 'verify.mjs'),
    `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { suggestCanonical, mergeFile } from 'tailwind-canonical';
    import plugin from 'tailwind-canonical/eslint';
    const require = createRequire(import.meta.url);
    assert.throws(() => require.resolve('eslint'), { code: 'MODULE_NOT_FOUND' });
    assert.throws(() => require.resolve('tailwind-merge'), { code: 'MODULE_NOT_FOUND' });
    assert.equal(suggestCanonical('p-[16px]').canonical, 'p-4');
    await assert.rejects(() => mergeFile('not-needed.jsx'), /optional peer dependency/);
    assert.throws(() => plugin.rules['no-conflicting-classes'].create({ options: [] }), /pnpm add -D tailwind-merge/);
  `,
  );
  run(process.execPath, ['verify.mjs'], standalone);
  process.stdout.write(
    'PASS installed tarball without optional peers: API imports, explicit merge errors\n',
  );

  for (const [eslint, merge] of matrix) {
    const consumer = mkdtempSync(join(temporary, 'consumer-'));
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        name: 'tailwind-canonical-compatibility-consumer',
        version: '1.0.0',
        private: true,
        type: 'module',
      }),
    );
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        archive,
        `eslint@${eslint}`,
        `tailwind-merge@${merge}`,
        `typescript@${manifest.devDependencies.typescript.replace(/^\^/, '')}`,
        '@types/node@22',
        '@types/eslint@8',
      ],
      consumer,
    );
    copyFileSync(
      new URL('./compatibility-consumer.mjs', import.meta.url),
      join(consumer, 'verify.mjs'),
    );
    const output = run(
      process.execPath,
      ['verify.mjs', eslint, merge],
      consumer,
    );
    process.stdout.write(output);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
