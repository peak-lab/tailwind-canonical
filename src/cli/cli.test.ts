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
import { pathToFileURL } from 'node:url';
import { flagWarnings, parseArgs, run, type Sink } from './cli.js';

const canImportTsConfig = await (async () => {
  const dir = join(tmpdir(), `twc-probe-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'probe.config.ts');
  writeFileSync(file, 'export default {}\n', 'utf8');
  try {
    await import(pathToFileURL(file).href);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();
const skipTsConfig = {
  skip: canImportTsConfig
    ? false
    : 'runtime .ts config import unsupported under this loader (tsx on Node 22)',
};

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

test(
  'run - honors attributeNames from config file',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    writeFileSync(join(dir, 'a.tsx'), '<div class="text-[12px]" />', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
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
  },
);

test(
  'run - defaultCommand can provide targets and transform flags',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    const src = join(dir, 'src');
    mkdirSync(src, { recursive: true });
    const file = join(src, 'a.tsx');
    writeFileSync(file, '<div className="text-[12px] text-sm flex" />', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      'export default { defaultCommand: { fix: true, sort: true, targets: ["src"] } }',
      'utf8',
    );
    const { sink, out } = captureSink();
    try {
      const result = await run([], dir, sink);
      assert.strictEqual(result.exitCode, 0);
      assert.ok(readFileSync(file, 'utf8').includes('flex text-xs text-sm'));
      assert.ok(out.some((l) => l.includes('✓ Fixed')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'run - CLI targets override defaultCommand targets',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    const src = join(dir, 'src');
    const app = join(dir, 'app');
    mkdirSync(src, { recursive: true });
    mkdirSync(app, { recursive: true });
    const srcFile = join(src, 'a.tsx');
    const appFile = join(app, 'b.tsx');
    writeFileSync(srcFile, '<div className="text-[12px]" />', 'utf8');
    writeFileSync(appFile, '<div className="text-[14px]" />', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      'export default { defaultCommand: { fix: true, targets: ["src"] } }',
      'utf8',
    );
    const { sink } = captureSink();
    try {
      const result = await run(['app'], dir, sink);
      assert.strictEqual(result.exitCode, 0);
      assert.ok(readFileSync(appFile, 'utf8').includes('text-sm'));
      assert.ok(readFileSync(srcFile, 'utf8').includes('text-[12px]'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'run - defaultCommand targets support negation globs',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    const src = join(dir, 'src');
    mkdirSync(src, { recursive: true });
    const included = join(src, 'included.tsx');
    const skipped = join(src, 'skipped.tsx');
    writeFileSync(included, '<div className="text-[12px]" />', 'utf8');
    writeFileSync(skipped, '<div className="text-[14px]" />', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      'export default { defaultCommand: { fix: true, targets: ["src/**/*.tsx", "!src/skipped.tsx"] } }',
      'utf8',
    );
    const { sink } = captureSink();
    try {
      const result = await run([], dir, sink);
      assert.strictEqual(result.exitCode, 0);
      assert.ok(readFileSync(included, 'utf8').includes('text-xs'));
      assert.ok(readFileSync(skipped, 'utf8').includes('text-[14px]'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'run - explicit mode flags override defaultCommand modes',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    const file = join(dir, 'a.tsx');
    writeFileSync(file, '<div className="text-[12px]" />', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      'export default { defaultCommand: { fix: true, targets: ["."] } }',
      'utf8',
    );
    const { sink } = captureSink();
    try {
      const result = await run(['--typos'], dir, sink);
      assert.strictEqual(result.exitCode, 0);
      assert.ok(readFileSync(file, 'utf8').includes('text-[12px]'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  'run - explicit reporter overrides defaultCommand reporter',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    writeFileSync(
      join(dir, 'a.tsx'),
      '<div className="text-[12px]" />',
      'utf8',
    );
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      'export default { defaultCommand: { reporter: "json", targets: ["."] } }',
      'utf8',
    );
    const { sink, out, raw } = captureSink();
    try {
      const result = await run(['--reporter', 'text'], dir, sink);
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(raw.length, 0);
      assert.ok(out.some((l) => l.includes('text-[12px] → text-xs')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

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

test('flagWarnings - typos chains with transforms, only watch is warned', (_t: TestContext) => {
  const w = flagWarnings(parseArgs(['--sort', '--watch', '--typos', 'src']));
  assert.deepEqual(w, ['--watch ignored: not supported with --typos']);
  assert.deepEqual(flagWarnings(parseArgs(['--fix', '--typos', 'src'])), []);
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
    assert.ok(out.some((l) => l.includes('Color variants')));
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

test('run - transforms chain with --typos and report the typo (issue #96)', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(
    file,
    '<div className="p-4 p-2 flex flex text-gry-500" />',
    'utf8',
  );
  const { sink, out, err } = captureSink();
  try {
    const result = await run(
      ['--fix', '--dedup', '--sort', '--typos', dir],
      dir,
      sink,
    );
    const content = readFileSync(file, 'utf8');
    assert.ok(!content.includes('flex flex'));
    assert.ok(!err.some((l) => l.includes('takes priority')));
    assert.ok(out.some((l) => l.includes('✓ Fixed')));
    assert.ok(out.some((l) => l.includes('text-gry-500 → text-gray-500')));
    assert.strictEqual(result.exitCode, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - transforms chain with --typos and exit 0 when clean', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="p-4 p-2 flex flex" />', 'utf8');
  const { sink, out } = captureSink();
  try {
    const result = await run(['--dedup', '--typos', dir], dir, sink);
    assert.ok(!readFileSync(file, 'utf8').includes('flex flex'));
    assert.ok(out.some((l) => l.includes('No likely typos found')));
    assert.strictEqual(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --fix --typos --reporter json merges typos into the transform report', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="text-[12px] bg-slte-100" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(
      ['--fix', '--typos', '--reporter', 'json', dir],
      dir,
      sink,
    );
    const parsed = JSON.parse(raw.join(''));
    assert.strictEqual(parsed.fixed, 1);
    assert.strictEqual(parsed.typoTotal, 1);
    assert.strictEqual(parsed.typos[0].suggestion, 'bg-slate-100');
    assert.strictEqual(result.exitCode, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --analyze still suppresses --typos and transforms', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="p-4 p-2 text-gry-500" />', 'utf8');
  const { sink, err, out } = captureSink();
  try {
    await run(['--analyze', '--typos', '--dedup', dir], dir, sink);
    assert.ok(
      err.some((l) => l.includes('--typos ignored: --analyze takes priority')),
    );
    assert.ok(
      err.some((l) => l.includes('--dedup ignored: --analyze takes priority')),
    );
    assert.ok(readFileSync(file, 'utf8').includes('p-4 p-2'));
    assert.ok(!out.some((l) => l.includes('[typo]')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --fix --typos --watch drops watch and runs the combined pass', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="p-4 p-2" />', 'utf8');
  const { sink, err } = captureSink();
  try {
    const result = await run(['--dedup', '--typos', '--watch', dir], dir, sink);
    assert.ok(
      err.some((l) =>
        l.includes('--watch ignored: not supported with --typos'),
      ),
    );
    assert.strictEqual(result.watching, undefined);
    assert.ok(!readFileSync(file, 'utf8').includes('p-4 p-2'));
    assert.strictEqual(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --fix --reporter sarif emits an empty SARIF document', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="text-[12px]" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(['--fix', '--reporter', 'sarif', dir], dir, sink);
    assert.ok(readFileSync(file, 'utf8').includes('text-xs'));
    const sarif = JSON.parse(raw.join(''));
    assert.strictEqual(sarif.version, '2.1.0');
    assert.strictEqual(sarif.runs[0].results.length, 0);
    assert.strictEqual(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --fix --typos --reporter sarif emits the typo document', async (_t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="text-[12px] bg-slte-100" />', 'utf8');
  const { sink, raw } = captureSink();
  try {
    const result = await run(
      ['--fix', '--typos', '--reporter', 'sarif', dir],
      dir,
      sink,
    );
    assert.ok(readFileSync(file, 'utf8').includes('text-xs'));
    const sarif = JSON.parse(raw.join(''));
    assert.strictEqual(sarif.runs[0].results.length, 1);
    assert.strictEqual(sarif.runs[0].results[0].ruleId, 'color-typo');
    assert.strictEqual(result.exitCode, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'run - defaultCommand chains transforms with typos',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    const file = join(dir, 'a.tsx');
    writeFileSync(file, '<div className="p-4 p-2 text-gry-500" />', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      `export default { defaultCommand: { dedup: true, typos: true, targets: ['${dir}'] } }\n`,
      'utf8',
    );
    const { sink, out } = captureSink();
    try {
      const result = await run([], dir, sink);
      assert.ok(!readFileSync(file, 'utf8').includes('p-4 p-2'));
      assert.ok(out.some((l) => l.includes('text-gry-500 → text-gray-500')));
      assert.strictEqual(result.exitCode, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

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

test(
  'run - --merge preserves leading next to configured custom text tokens',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    const file = join(dir, 'a.tsx');
    const content =
      '<span className="font-mono leading-none text-2xs text-text-quaternary" />';
    writeFileSync(file, content, 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      'export default { customTextTokens: { 11: "2xs" } }',
      'utf8',
    );
    const { sink } = captureSink();
    try {
      const result = await run(['--merge', file], dir, sink);
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(readFileSync(file, 'utf8'), content);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

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
    assert.ok(out.some((l) => l.includes('Color variants')));
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
    assert.ok(out.some((l) => l.includes('-mt-2')));
    assert.ok(out.some((l) => l.includes('Rare scale values')));
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

test(
  'run - --analyze does not warn for configured class functions',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    writeFileSync(join(dir, 'a.tsx'), 'cn("gap-2")', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
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
  },
);

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

test(
  'run - --analyze text output honors analyze display config',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
      'export default { analyze: { maxScaleGroups: 1, maxScaleValues: 1, maxRareValues: 1, maxPatterns: 1 } }',
      'utf8',
    );
    for (let i = 0; i < 12; i++) {
      writeFileSync(
        join(dir, `common-${i}.tsx`),
        '<div className="gap-2 px-4" />',
        'utf8',
      );
    }
    writeFileSync(
      join(dir, 'rare-a.tsx'),
      '<div className="gap-24 px-11" />',
      'utf8',
    );
    writeFileSync(
      join(dir, 'rare-b.tsx'),
      '<div className="gap-10 px-7" />',
      'utf8',
    );
    const comboA = '<div className="flex items-center p-4" />';
    const comboB = '<div className="grid gap-2 p-4" />';
    for (const [index, combo] of [comboA, comboB].entries()) {
      for (let i = 0; i < 3; i++) {
        writeFileSync(join(dir, `combo-${index}-${i}.tsx`), combo, 'utf8');
      }
    }
    const { sink, out } = captureSink();
    try {
      const result = await run(['--analyze', dir], dir, sink);
      assert.strictEqual(result.exitCode, 1);
      assert.ok(out.some((l) => l.includes('+1 more scale groups')));
      assert.ok(out.some((l) => l.includes('+1 more')));
      assert.ok(out.some((l) => l.includes('+3 more rare values')));
      assert.ok(out.some((l) => l.includes('+2 more repeated patterns')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

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

test('run - --help exits 0 and prints usage', async (_t: TestContext) => {
  const { sink, out } = captureSink();
  const result = await run(['--help'], freshDir(), sink);
  assert.strictEqual(result.exitCode, 0);
  assert.ok(out.some((l) => l.includes('Usage:')));
  assert.ok(out.some((l) => l.includes('--help, -h')));
  assert.ok(out.some((l) => l.includes('--version, -V')));
  assert.ok(out.some((l) => l.includes('Mode precedence:')));
});

test('run - -h short flag exits 0 and prints usage', async (_t: TestContext) => {
  const { sink, out } = captureSink();
  const result = await run(['-h'], freshDir(), sink);
  assert.strictEqual(result.exitCode, 0);
  assert.ok(out.some((l) => l.includes('Usage:')));
});

test('run - -V short flag exits 0 and prints the version', async (_t: TestContext) => {
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const { sink, out } = captureSink();
  const result = await run(['-V'], freshDir(), sink);
  assert.strictEqual(result.exitCode, 0);
  assert.ok(out.includes(pkg.version));
});

test('run - --version wins over a reporter error', async (_t: TestContext) => {
  const { sink, out, err } = captureSink();
  const result = await run(
    ['--version', '--reporter', 'xml'],
    freshDir(),
    sink,
  );
  assert.strictEqual(result.exitCode, 0);
  assert.strictEqual(err.length, 0);
  assert.ok(out.length > 0);
});

test('run - --reporter followed by a flag is a missing value', async (_t: TestContext) => {
  const dir = freshDir();
  const { sink, err } = captureSink();
  try {
    const result = await run([dir, '--reporter', '--fix'], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      err.some((l) =>
        l.includes('Missing value for --reporter (expected text|json|sarif)'),
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - --version exits 0 and prints the package.json version', async (_t: TestContext) => {
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const { sink, out } = captureSink();
  const result = await run(['--version'], freshDir(), sink);
  assert.strictEqual(result.exitCode, 0);
  assert.ok(out.includes(pkg.version));
});

test('run - nonexistent target exits 1 with No files matched', async (_t: TestContext) => {
  const dir = freshDir();
  const { sink, err } = captureSink();
  try {
    const result = await run([join(dir, 'does-not-exist')], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(err.some((l) => l.includes('No files matched:')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run - dangling --reporter exits 1 with the missing-value error', async (_t: TestContext) => {
  const dir = freshDir();
  const { sink, err } = captureSink();
  try {
    const result = await run([dir, '--reporter'], dir, sink);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(
      err.some((l) =>
        l.includes('Missing value for --reporter (expected text|json|sarif)'),
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'run - surfaces invalid config and exits 1',
  skipTsConfig,
  async (_t: TestContext) => {
    const dir = freshDir();
    writeFileSync(join(dir, 'a.tsx'), '<div className="flex" />', 'utf8');
    writeFileSync(
      join(dir, 'tailwind-canonical.config.ts'),
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
  },
);
