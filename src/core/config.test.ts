import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { loadConfig, validateConfig } from './config.js';

let dirCounter = 0;
function freshDir(): string {
  dirCounter += 1;
  const dir = join(tmpdir(), `twc-cfg-${process.pid}-${dirCounter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('validateConfig - undefined/null become empty config', (_t: TestContext) => {
  assert.deepEqual(validateConfig(undefined), {});
  assert.deepEqual(validateConfig(null), {});
});

test('validateConfig - rejects non-object default', (_t: TestContext) => {
  assert.throws(() => validateConfig(42), /must be an object/);
  assert.throws(() => validateConfig([]), /must be an object/);
  assert.throws(() => validateConfig('x'), /must be an object/);
});

test('validateConfig - rejects unknown keys (catches typos)', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ sortOder: [] }),
    /unknown key "sortOder"/,
  );
});

test('validateConfig - accepts a full valid config', (_t: TestContext) => {
  const cfg = {
    customTextTokens: { 11: '2xs' },
    customSpacingTokens: { 14: '3.5' },
    ignorePatterns: [/^aspect-/],
    functionNames: ['cn', 'clsx'],
    attributeNames: ['className', 'class'],
    sortOrder: ['display', 'spacing', 'colors'],
    extraColorFamilies: { brand: 'brand' },
    extraScaleProperties: ['scroll-p'],
    analyze: {
      minRareScalePropertyOccurrences: 20,
      rareScaleMaxFiles: 1,
      rareScaleMaxCount: 3,
      maxScaleGroups: 4,
      maxScaleValues: 2,
      maxRareValues: 6,
      maxPatterns: 5,
    },
    minRareScalePropertyOccurrences: 20,
    rareScaleMaxFiles: 1,
    rareScaleMaxCount: 3,
    defaultCommand: {
      fix: true,
      dedup: true,
      merge: true,
      sort: true,
      watch: false,
      reporter: 'json',
      targets: ['src'],
    },
  };
  assert.deepEqual(validateConfig(cfg), cfg);
});

test('validateConfig - defaultCommand options', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ defaultCommand: [] }),
    /defaultCommand must be an object/,
  );
  assert.throws(
    () => validateConfig({ defaultCommand: { target: ['src'] } }),
    /defaultCommand contains unknown key "target"/,
  );
  assert.throws(
    () => validateConfig({ defaultCommand: { fix: 'yes' } }),
    /defaultCommand\.fix must be a boolean/,
  );
  assert.throws(
    () => validateConfig({ defaultCommand: { reporter: 'xml' } }),
    /defaultCommand\.reporter must be one of/,
  );
  assert.throws(
    () => validateConfig({ defaultCommand: { targets: [1] } }),
    /defaultCommand\.targets must be an array of strings/,
  );
  assert.deepEqual(
    validateConfig({
      defaultCommand: {
        fix: true,
        sort: true,
        reporter: 'json',
        targets: ['src'],
      },
    }),
    {
      defaultCommand: {
        fix: true,
        sort: true,
        reporter: 'json',
        targets: ['src'],
      },
    },
  );
});

test('validateConfig - rare scale thresholds must be positive integers', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ minRareScalePropertyOccurrences: 0 }),
    /positive integer/,
  );
  assert.throws(
    () => validateConfig({ rareScaleMaxFiles: 1.5 }),
    /positive integer/,
  );
  assert.throws(
    () => validateConfig({ rareScaleMaxCount: '2' }),
    /positive integer/,
  );
  assert.deepEqual(validateConfig({ rareScaleMaxFiles: 2 }), {
    rareScaleMaxFiles: 2,
  });
});

test('validateConfig - analyze options must be known positive integers', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ analyze: [] }),
    /analyze must be an object/,
  );
  assert.throws(
    () => validateConfig({ analyze: { nope: 1 } }),
    /analyze contains unknown key "nope"/,
  );
  assert.throws(
    () => validateConfig({ analyze: { maxScaleGroups: 0 } }),
    /analyze\.maxScaleGroups must be a positive integer/,
  );
  assert.deepEqual(validateConfig({ analyze: { maxScaleGroups: 2 } }), {
    analyze: { maxScaleGroups: 2 },
  });
});

test('validateConfig - extraColorFamilies must be a string record', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ extraColorFamilies: [] }),
    /must be an object/,
  );
  assert.throws(
    () => validateConfig({ extraColorFamilies: { brand: 5 } }),
    /must be a string/,
  );
  assert.deepEqual(validateConfig({ extraColorFamilies: { brand: 'brand' } }), {
    extraColorFamilies: { brand: 'brand' },
  });
});

test('validateConfig - extraScaleProperties must be a string[]', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ extraScaleProperties: [1] }),
    /must be an array of strings/,
  );
  assert.throws(
    () => validateConfig({ extraScaleProperties: 'scroll-p' }),
    /must be an array of strings/,
  );
  assert.deepEqual(validateConfig({ extraScaleProperties: ['scroll-p'] }), {
    extraScaleProperties: ['scroll-p'],
  });
});

test('validateConfig - customTextTokens shape', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ customTextTokens: { abc: 'x' } }),
    /keys must be integers/,
  );
  assert.throws(
    () => validateConfig({ customTextTokens: { 12: 5 } }),
    /must be a string/,
  );
  assert.throws(
    () => validateConfig({ customTextTokens: [] }),
    /must be an object/,
  );
});

test('validateConfig - ignorePatterns must be RegExp[]', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ ignorePatterns: ['not-a-regex'] }),
    /must be an array of RegExp/,
  );
  assert.deepEqual(validateConfig({ ignorePatterns: [/x/] }), {
    ignorePatterns: [/x/],
  });
});

test('validateConfig - string arrays', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ functionNames: [1] }),
    /must be an array of strings/,
  );
  assert.throws(
    () => validateConfig({ attributeNames: 'class' }),
    /must be an array of strings/,
  );
});

test('validateConfig - sortOrder rejects invalid categories', (_t: TestContext) => {
  assert.throws(
    () => validateConfig({ sortOrder: ['display', 'bogus'] }),
    /invalid category "bogus"/,
  );
  assert.throws(
    () => validateConfig({ sortOrder: 'display' }),
    /must be an array/,
  );
  assert.deepEqual(validateConfig({ sortOrder: ['display'] }), {
    sortOrder: ['display'],
  });
});

test('loadConfig - missing file returns empty config', async (_t: TestContext) => {
  assert.deepEqual(await loadConfig(freshDir()), {});
});

test('loadConfig - reads and validates a TypeScript config file', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(
    join(dir, 'tailwind-canonical.config.ts'),
    'export default { sortOrder: ["display"] satisfies string[] }',
    'utf8',
  );
  try {
    assert.deepEqual(await loadConfig(dir), { sortOrder: ['display'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig - prefers TypeScript config over JavaScript fallback', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(
    join(dir, 'tailwind-canonical.config.ts'),
    'export default { sortOrder: ["display"] }',
    'utf8',
  );
  writeFileSync(
    join(dir, 'tailwind-canonical.config.js'),
    'export default { sortOrder: ["spacing"] }',
    'utf8',
  );
  try {
    assert.deepEqual(await loadConfig(dir), { sortOrder: ['display'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig - falls back to JavaScript config file', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(
    join(dir, 'tailwind-canonical.config.js'),
    'export default { sortOrder: ["spacing"] }',
    'utf8',
  );
  try {
    assert.deepEqual(await loadConfig(dir), { sortOrder: ['spacing'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig - rejects when the config file has a syntax error', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(
    join(dir, 'tailwind-canonical.config.ts'),
    'export default { sortOrder: [',
    'utf8',
  );
  try {
    await assert.rejects(loadConfig(dir), /tailwind-canonical\.config\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig - surfaces validation errors from a present file', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(
    join(dir, 'tailwind-canonical.config.ts'),
    'export default { sortOrder: ["nope"] }',
    'utf8',
  );
  try {
    await assert.rejects(
      loadConfig(dir),
      /Invalid tailwind-canonical\.config\.ts: .*invalid category "nope"/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
