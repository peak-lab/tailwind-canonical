import assert from 'node:assert';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { flagWarnings, parseArgs, run, type Sink } from './cli.js';

let counter = 0;
function freshDir(): string {
  counter += 1;
  const dir = join(tmpdir(), `twc-cli-${process.pid}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function captureSink(): {
  sink: Sink;
  out: string[];
  err: string[];
  raw: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const raw: string[] = [];
  return {
    out,
    err,
    raw,
    sink: {
      log: (s) => out.push(s),
      error: (s) => err.push(s),
      write: (s) => raw.push(s),
    },
  };
}

test('parseArgs - flags, reporter, targets', (_t: TestContext) => {
  const f = parseArgs(['--fix', '--reporter', 'json', 'src', 'app']);
  assert.strictEqual(f.fix, true);
  assert.strictEqual(f.reporter, 'json');
  assert.deepEqual(f.targets, ['src', 'app']);
});

test('parseArgs - reporter value is not treated as a target', (_t: TestContext) => {
  const f = parseArgs(['--reporter', 'sarif', 'src']);
  assert.deepEqual(f.targets, ['src']);
  assert.strictEqual(f.reporter, 'sarif');
});

test('parseArgs - equals form reporter', (_t: TestContext) => {
  const f = parseArgs(['--reporter=json', 'src']);
  assert.strictEqual(f.reporter, 'json');
  assert.deepEqual(f.targets, ['src']);
  assert.strictEqual(f.error, undefined);
});

test('parseArgs - dir named json/sarif stays a target', (_t: TestContext) => {
  const f = parseArgs(['--reporter', 'text', 'json', 'sarif']);
  assert.strictEqual(f.reporter, 'text');
  assert.deepEqual(f.targets, ['json', 'sarif']);
});

test('parseArgs - unknown reporter sets error', (_t: TestContext) => {
  const space = parseArgs(['--reporter', 'xml', 'src']);
  assert.ok(space.error);
  assert.strictEqual(space.reporter, 'text');
  const equals = parseArgs(['--reporter=xml', 'src']);
  assert.ok(equals.error);
});

test('run - no targets prints usage and exits 1', async (_t: TestContext) => {
  const { sink, err } = captureSink();
  const result = await run([], freshDir(), sink);
  assert.strictEqual(result.exitCode, 1);
  assert.match(err[0], /^Usage:/);
});

test('run - check mode reports findings and exits 1', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-[12px]" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run([dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(out.some((l) => l.includes('text-[12px] → text-xs')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - clean files exit 0', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="flex text-xs" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run([dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(out.some((l) => l.includes('No non-canonical classes found')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --fix rewrites file and prints summary', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="text-[12px]" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--fix', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(readFileSync(file, 'utf8').includes('text-xs'));
    assert.ok(out.some((l) => l.includes('✓ Fixed')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - json reporter writes structured findings', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-[12px]" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--reporter', 'json', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(raw.join(''));
    assert.strictEqual(parsed.total, 1);
    assert.strictEqual(parsed.findings[0].canonical, 'text-xs');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --reporter=json (equals form) writes JSON', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-[12px]" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--reporter=json', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(raw.join(''));
    assert.strictEqual(parsed.total, 1);
    assert.strictEqual(parsed.findings[0].canonical, 'text-xs');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - dir literally named json is lintable', async (_t: TestContext) => {
  const dir = freshDir();
  const jsonDir = join(dir, 'json');
  mkdirSync(jsonDir, { recursive: true });
  writeFileSync(join(jsonDir, 'a.tsx'), '<div className="flex" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run([jsonDir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(out.some((l) => l.includes('No non-canonical classes found')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - unknown reporter errors and exits 1', async (_t: TestContext) => {
  const dir = freshDir();
  const { sink, err } = captureSink();
  try {
    const result = await run(['--reporter', 'xml', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.match(err[0], /Unknown reporter: xml/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - analyze mode reports cross-file inconsistencies', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-red-500" />', 'utf8');
  writeFileSync(
    join(dir, 'b.tsx'),
    '<div className="text-rose-600" />',
    'utf8',
  );
  const { sink, raw } = captureSink();
  try {
    const result = await run(
      ['--analyze', '--reporter', 'json', dir],
      dir,
      sink,
    );
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(raw.join(''));
    assert.strictEqual(parsed.colorVariants.length, 1);
    assert.ok(Array.isArray(parsed.rareScaleValues));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - sarif reporter emits results and exits 1', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-[12px]" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--reporter', 'sarif', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    const sarif = JSON.parse(raw.join(''));
    assert.strictEqual(sarif.version, '2.1.0');
    assert.strictEqual(sarif.runs[0].results.length, 1);
    assert.match(
      sarif.runs[0].results[0].message.text,
      /text-\[12px\] → text-xs/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --sort rewrites file and reports summary', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="text-sm flex p-4" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--sort', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(readFileSync(file, 'utf8').includes('flex p-4 text-sm'));
    assert.ok(out.some((l) => l.includes('✓ Fixed')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - check json on clean files exits 0', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="flex text-xs" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--reporter', 'json', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(JSON.parse(raw.join('')).total, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - honors attributeNames from config file', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div class="text-[12px]" />', 'utf8');
  writeFileSync(
    join(dir, 'tailwind-canonical.config.js'),
    'export default { attributeNames: ["class"] }',
    'utf8',
  );
  const { sink, out } = captureSink();
  try {
    const result = await run([dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(out.some((l) => l.includes('text-[12px] → text-xs')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --typos flags near-miss colors and exits 1', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-gry-500" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--typos', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(out.some((l) => l.includes('text-gry-500 → text-gray-500')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --typos json reporter and clean exit', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(
    join(dir, 'a.tsx'),
    '<div className="text-gray-500" />',
    'utf8',
  );
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--typos', '--reporter', 'json', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(JSON.parse(raw.join('')).total, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - one unreadable file does not abort the batch', async (t: TestContext) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('chmod is bypassed when running as root');
    return;
  }
  const dir = freshDir();
  const good = join(dir, 'good.tsx');
  const bad = join(dir, 'bad.tsx');
  writeFileSync(good, '<div className="text-[12px]" />', 'utf8');
  writeFileSync(bad, '<div className="text-[14px]" />', 'utf8');
  chmodSync(bad, 0o000);
  const { sink, out, err } = captureSink();
  try {
    const result = await run(['--fix', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(readFileSync(good, 'utf8').includes('text-xs'));
    assert.ok(err.some((l) => l.includes('bad.tsx')));
    assert.ok(out.some((l) => l.includes('good.tsx')));
  } finally {
    chmodSync(bad, 0o644);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('flagWarnings - analyze suppresses transform/typos/watch flags', (_t: TestContext) => {
  const w = flagWarnings(
    parseArgs(['--fix', '--typos', '--watch', '--analyze', 'src']),
  );
  assert.deepEqual(w, [
    '--fix ignored: --analyze takes priority',
    '--typos ignored: --analyze takes priority',
    '--watch ignored: not supported with --analyze',
  ]);
});

test('flagWarnings - typos suppresses transform flags and watch', (_t: TestContext) => {
  const w = flagWarnings(parseArgs(['--sort', '--watch', '--typos', 'src']));
  assert.deepEqual(w, [
    '--sort ignored: --typos takes priority',
    '--watch ignored: not supported with --typos',
  ]);
});

test('flagWarnings - transform/check mode emits no warnings (watch honored)', (_t: TestContext) => {
  assert.deepEqual(flagWarnings(parseArgs(['--fix', '--watch', 'src'])), []);
  assert.deepEqual(flagWarnings(parseArgs(['src'])), []);
});

test('run - --fix --analyze warns about ignored --fix but stays in analyze mode', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-red-500" />', 'utf8');
  writeFileSync(
    join(dir, 'b.tsx'),
    '<div className="text-rose-600" />',
    'utf8',
  );
  const fixed = join(dir, 'a.tsx');
  const { sink, err, out } = captureSink();
  try {
    const result = await run(['--fix', '--analyze', dir], dir, sink);
    assert.ok(
      err.some((l) => l.includes('--fix ignored: --analyze takes priority')),
    );
    assert.ok(readFileSync(fixed, 'utf8').includes('text-red-500'));
    assert.ok(out.some((l) => l.includes('color variants')));
    assert.strictEqual(result.exitCode, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --typos --watch warns about ignored watch and does not watch', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-gry-500" />', 'utf8');
  const { sink, err } = captureSink();
  try {
    const result = await run(['--typos', '--watch', dir], dir, sink);
    assert.ok(
      err.some((l) =>
        l.includes('--watch ignored: not supported with --typos'),
      ),
    );
    assert.strictEqual(result.watching, undefined);
    assert.strictEqual(result.exitCode, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --fix --reporter json emits a transform summary', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="text-[12px]" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--fix', '--reporter', 'json', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    const parsed = JSON.parse(raw.join(''));
    assert.strictEqual(parsed.files, 1);
    assert.strictEqual(parsed.fixed, 1);
    assert.deepEqual(parsed.changedFiles, [file]);
    assert.ok(readFileSync(file, 'utf8').includes('text-xs'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - combined --fix --dedup --merge --sort runs the full pipeline', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  // text-[12px]→text-xs (fix), duplicate p-2 (dedup), bg conflict (merge),
  // out-of-order classes (sort).
  writeFileSync(
    file,
    '<div className="text-[12px] p-2 p-2 bg-red-500 bg-blue-500 flex" />',
    'utf8',
  );
  const { sink, out } = captureSink();
  try {
    const result = await run(
      ['--fix', '--dedup', '--merge', '--sort', dir],
      dir,
      sink,
    );
    assert.strictEqual(result.exitCode, 0);
    const content = readFileSync(file, 'utf8');
    assert.ok(content.includes('text-xs'), 'fix applied');
    assert.ok(content.includes('bg-blue-500'), 'merge kept last bg');
    assert.ok(!content.includes('bg-red-500'), 'merge dropped conflicting bg');
    assert.ok(!/p-2\s+p-2/.test(content), 'dedup collapsed duplicate padding');
    assert.ok(out.some((l) => l.includes('✓ Fixed')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - combined pipeline json reports per-transform counts', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(
    file,
    '<div className="text-[12px] bg-red-500 bg-blue-500" />',
    'utf8',
  );
  const { sink, raw } = captureSink();
  try {
    const result = await run(
      ['--fix', '--merge', '--reporter', 'json', dir],
      dir,
      sink,
    );
    assert.strictEqual(result.exitCode, 0);
    const parsed = JSON.parse(raw.join(''));
    assert.ok(parsed.fixed >= 1);
    assert.ok(parsed.merged >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --merge precheck passes when tailwind-merge is installed', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="bg-red-500 bg-blue-500" />', 'utf8');
  const { sink, err } = captureSink();
  try {
    const result = await run(['--merge', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(
      !err.some((l) => l.includes('requires tailwind-merge')),
      'precheck should not report the peer as missing',
    );
    assert.ok(readFileSync(file, 'utf8').includes('bg-blue-500'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --typos --reporter json emits findings array', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-gry-500" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--typos', '--reporter', 'json', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(raw.join(''));
    assert.strictEqual(parsed.total, 1);
    assert.strictEqual(parsed.typos[0].original, 'text-gry-500');
    assert.strictEqual(parsed.typos[0].suggestion, 'text-gray-500');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze text mode reports color variants and exits 1', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="text-red-500" />', 'utf8');
  writeFileSync(
    join(dir, 'b.tsx'),
    '<div className="text-rose-600" />',
    'utf8',
  );
  const { sink, out } = captureSink();
  try {
    const result = await run(['--analyze', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(out.some((l) => l.includes('color variants')));
    assert.ok(out.some((l) => l.includes('consistency issue')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze text mode reports scale inconsistencies', async (_t: TestContext) => {
  const dir = freshDir();
  // Same property (gap) with two different scale values; needs >=3 occurrences.
  writeFileSync(join(dir, 'a.tsx'), '<div className="gap-2" />', 'utf8');
  writeFileSync(join(dir, 'b.tsx'), '<div className="gap-3" />', 'utf8');
  writeFileSync(join(dir, 'c.tsx'), '<div className="gap-2" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--analyze', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(out.some((l) => l.includes('inconsistency')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze text mode reports rare scale values with negative class formatting', async (_t: TestContext) => {
  const dir = freshDir();
  for (let i = 0; i < 12; i++) {
    writeFileSync(
      join(dir, `common-${i}.tsx`),
      '<div className="mt-2" />',
      'utf8',
    );
  }
  writeFileSync(join(dir, 'rare.tsx'), '<div className="-mt-2" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--analyze', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(out.some((l) => l.includes('Rare: -mt-2')));
    assert.ok(out.some((l) => l.includes('-mt-2') && !l.includes('mt--2')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze warns when known class functions are not configured', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), 'cn("gap-2")', 'utf8');
  writeFileSync(join(dir, 'b.tsx'), '<div className="gap-3" />', 'utf8');
  writeFileSync(join(dir, 'c.tsx'), '<div className="gap-2" />', 'utf8');
  const { sink, err } = captureSink();
  try {
    const result = await run(['--analyze', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(err.some((l) => l.includes('functionNames')));
    assert.ok(err.some((l) => l.includes('cn(...)')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze does not warn for configured class functions', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), 'cn("gap-2")', 'utf8');
  writeFileSync(
    join(dir, 'tailwind-canonical.config.js'),
    'export default { functionNames: ["cn"] }',
    'utf8',
  );
  const { sink, err } = captureSink();
  try {
    const result = await run(['--analyze', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.deepEqual(err, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze text mode reports repeated combinations', async (_t: TestContext) => {
  const dir = freshDir();
  const combo = '<div className="flex items-center justify-between p-4" />';
  // Repeated combination needs to appear in >=3 files.
  writeFileSync(join(dir, 'a.tsx'), combo, 'utf8');
  writeFileSync(join(dir, 'b.tsx'), combo, 'utf8');
  writeFileSync(join(dir, 'c.tsx'), combo, 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--analyze', dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(out.some((l) => l.includes('Pattern:')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze text mode on clean files exits 0', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="flex" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--analyze', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(out.some((l) => l.includes('No cross-file inconsistencies')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - sarif reporter on clean files emits empty results and exits 0', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="flex text-xs" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--reporter', 'sarif', dir], dir, sink);
    assert.strictEqual(result.exitCode, 0);
    const sarif = JSON.parse(raw.join(''));
    assert.strictEqual(sarif.version, '2.1.0');
    assert.strictEqual(sarif.runs[0].results.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - surfaces invalid config and exits 1', async (_t: TestContext) => {
  const dir = freshDir();
  writeFileSync(join(dir, 'a.tsx'), '<div className="flex" />', 'utf8');
  writeFileSync(
    join(dir, 'tailwind-canonical.config.js'),
    'export default { sortOrder: ["nope"] }',
    'utf8',
  );
  const { sink, err } = captureSink();
  try {
    const result = await run([dir], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(err.some((l) => l.includes('invalid category "nope"')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
