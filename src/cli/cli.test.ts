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
import { parseArgs, run, type Sink } from './cli.js';

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
