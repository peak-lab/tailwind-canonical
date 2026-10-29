// Copied to a temporary project: imports must resolve from the installed tarball.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Linter } from 'eslint';
import {
  analyzeFile,
  fixFile,
  mergeFile,
  resolveTargets,
  suggestCanonical,
} from 'tailwind-canonical';
import plugin from 'tailwind-canonical/eslint';

const require = createRequire(import.meta.url);
const [eslintVersion, mergeVersion] = process.argv.slice(2);
assert.equal(require('eslint/package.json').version, eslintVersion);
assert.equal(
  JSON.parse(
    readFileSync(
      join('node_modules', 'tailwind-merge', 'package.json'),
      'utf8',
    ),
  ).version,
  mergeVersion,
);
assert.equal(suggestCanonical('p-[16px]').canonical, 'p-4');

writeFileSync('fixture.jsx', '<div className="text-[12px]" />');
assert.equal(suggestCanonical('text-[12px]'), null);
assert.equal(analyzeFile('fixture.jsx').length, 0);
assert.equal(fixFile('fixture.jsx'), 0);
assert.equal(
  readFileSync('fixture.jsx', 'utf8'),
  '<div className="text-[12px]" />',
);
const allowFontChanges = { allowTextSizeLineHeightChanges: true };
assert.equal(analyzeFile('fixture.jsx', allowFontChanges).length, 1);
assert.equal(fixFile('fixture.jsx', allowFontChanges), 1);
assert.equal(
  readFileSync('fixture.jsx', 'utf8'),
  '<div className="text-xs" />',
);
assert.equal((await resolveTargets(['*.jsx'])).length, 1);
writeFileSync(
  'fixture.jsx',
  '<div className="p-2 p-4 leading-6 text-[13px]" />',
);
assert.equal(await mergeFile('fixture.jsx'), 1);
assert.equal(
  readFileSync('fixture.jsx', 'utf8'),
  '<div className="p-4 leading-6 text-[13px]" />',
);

const linter = new Linter({ configType: 'flat' });
const configs = [
  plugin.configs.recommended,
  {
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'tailwind-canonical/no-conflicting-classes': [
        'error',
        { functionNames: ['cn'] },
      ],
    },
  },
];
for (const [source, expected] of [
  [
    'const x = <div className="text-[12px]" />;',
    'const x = <div className="text-[12px]" />;',
  ],
  [
    'const x = cn("p-2 p-4 leading-6 text-[13px]");',
    'const x = cn("p-4 leading-6 text-[13px]");',
  ],
  ['const message = "Hello  world";', 'const message = "Hello  world";'],
  [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal JavaScript source fixture.
    'const x = cn(`text-[12px]${suffix}`);',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal JavaScript source fixture.
    'const x = cn(`text-[12px]${suffix}`);',
  ],
  [
    'const x = cn(value === "p-[16px]" && "px-[16px]");',
    'const x = cn(value === "p-[16px]" && "px-4");',
  ],
]) {
  const result = linter.verifyAndFix(source, configs);
  assert.deepEqual(result.messages, [], source);
  assert.equal(result.output, expected);
}

const fontSource = 'const x = <div className="text-[12px] p-[8px]" />;';
const strictFont = linter.verifyAndFix(fontSource, configs);
assert.deepEqual(strictFont.messages, []);
assert.equal(
  strictFont.output,
  'const x = <div className="text-[12px] p-2" />;',
);
const permissiveFont = linter.verifyAndFix(fontSource, [
  ...configs,
  {
    rules: {
      'tailwind-canonical/no-arbitrary-canonical': ['error', allowFontChanges],
    },
  },
]);
assert.deepEqual(permissiveFont.messages, []);
assert.equal(
  permissiveFont.output,
  'const x = <div className="text-xs p-2" />;',
);

const cli = join(
  'node_modules',
  'tailwind-canonical',
  'dist',
  'cli',
  'index.js',
);
assert.equal(spawnSync(process.execPath, [cli, '--version']).status, 0);
assert.equal(
  spawnSync(join('node_modules', '.bin', 'tailwind-canonical'), ['--version'])
    .status,
  0,
);
writeFileSync('fixture.jsx', '<div className="p-[16px]" />');
assert.equal(
  spawnSync(process.execPath, [cli, '--check', '--fix', 'fixture.jsx']).status,
  1,
);
assert.equal(
  readFileSync('fixture.jsx', 'utf8'),
  '<div className="p-[16px]" />',
);
const fixed = spawnSync(process.execPath, [cli, '--fix', 'fixture.jsx'], {
  encoding: 'utf8',
});
assert.equal(fixed.status, 0, fixed.stderr);
assert.equal(readFileSync('fixture.jsx', 'utf8'), '<div className="p-4" />');

writeFileSync('font.jsx', '<div className="leading-6 text-[12px] p-[8px]" />');
const strictCli = spawnSync(process.execPath, [cli, '--fix', 'font.jsx'], {
  encoding: 'utf8',
});
assert.equal(strictCli.status, 0, strictCli.stderr);
assert.equal(
  readFileSync('font.jsx', 'utf8'),
  '<div className="leading-6 text-[12px] p-2" />',
);
writeFileSync(
  'tailwind-canonical.config.mjs',
  'export default { allowTextSizeLineHeightChanges: true };',
);
const permissiveCli = spawnSync(process.execPath, [cli, '--fix', 'font.jsx'], {
  encoding: 'utf8',
});
assert.equal(permissiveCli.status, 0, permissiveCli.stderr);
assert.equal(
  readFileSync('font.jsx', 'utf8'),
  '<div className="leading-6 text-xs p-2" />',
);

// Validate the declarations as a strict TypeScript consumer, including the
// preset in ESLint's public configuration type; do not mask declaration errors.
writeFileSync(
  'consumer.mts',
  `
import { Linter } from 'eslint';
import plugin from 'tailwind-canonical/eslint';
import { suggestCanonical, type Config } from 'tailwind-canonical';
const config: Config = { tailwindVersion: 4, allowTextSizeLineHeightChanges: true };
const eslintConfig: Linter.FlatConfig = plugin.configs.recommended;
new Linter({ configType: 'flat' }).verify('const x = 1;', [eslintConfig]);
suggestCanonical('p-[16px]', config);
`,
);
execFileSync(
  process.execPath,
  [
    join('node_modules', 'typescript', 'bin', 'tsc'),
    '--noEmit',
    '--strict',
    '--module',
    'nodenext',
    '--target',
    'es2022',
    'consumer.mts',
  ],
  { encoding: 'utf8' },
);
console.log(
  `PASS ESLint ${eslintVersion} × tailwind-merge ${mergeVersion}: installed tarball, API, CLI, autofix, consumer types`,
);
