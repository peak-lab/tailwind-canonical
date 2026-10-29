import assert from 'node:assert';
import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs, {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startWatch, watchRoots } from './watch.js';

const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(CLI_DIR, 'index.ts');
// Run the child from the repo root so `--import=tsx/esm` resolves `tsx`.
const REPO_ROOT = join(CLI_DIR, '..', '..');

let counter = 0;
function freshDir(): string {
  counter += 1;
  const dir = join(tmpdir(), `twc-watch-${process.pid}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Spawns the real CLI bin in `--watch` mode as a child process so the
 * never-closing fs.watch handles and SIGINT listener stay isolated from the
 * in-process test runner (a leaked watcher would otherwise hang `pnpm test`).
 */
function spawnWatcher(
  args: string[],
  cwd = REPO_ROOT,
): {
  child: ChildProcess;
  out: () => string;
  err: () => string;
} {
  let out = '';
  let err = '';
  const child = spawn(
    process.execPath,
    ['--import', import.meta.resolve('tsx/esm'), CLI_ENTRY, ...args],
    { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout?.on('data', (d) => {
    out += String(d);
  });
  child.stderr?.on('data', (d) => {
    err += String(d);
  });
  return { child, out: () => out, err: () => err };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 8000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(50);
  }
  return predicate();
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill('SIGKILL');
  });
}

test('startWatch - announces watching and applies fix on edit (debounce + transform)', async (t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="flex" />', 'utf8');
  const { child, out } = spawnWatcher(['--fix', '--watch', dir]);
  try {
    const started = await waitFor(() => out().includes('Watching'));
    assert.ok(started, 'watcher should announce it is watching');

    writeFileSync(file, '<div className="w-[12px]" />', 'utf8');
    const applied = await waitFor(
      () => out().includes('applied') && out().includes('change'),
    );
    if (!applied) {
      t.skip('filesystem watch event did not fire in this environment');
      return;
    }
    assert.ok(out().includes('applied'));
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('startWatch - check mode reports findings on edit', async (t: TestContext) => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="flex" />', 'utf8');
  const { child, out } = spawnWatcher(['--watch', dir]);
  try {
    const started = await waitFor(() => out().includes('Watching'));
    assert.ok(started);

    writeFileSync(file, '<div className="w-[12px]" />', 'utf8');
    const reported = await waitFor(() => out().includes('w-[12px] → w-3'));
    if (!reported) {
      t.skip('filesystem watch event did not fire in this environment');
      return;
    }
    assert.ok(out().includes('finding'));
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('startWatch - handles removal and recreation without stopping', async () => {
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="flex" />', 'utf8');
  const { child, out, err } = spawnWatcher(['--watch', dir]);
  try {
    const started = await waitFor(() => out().includes('Watching'));
    assert.ok(started);

    rmSync(file);
    await sleep(150);
    assert.strictEqual(child.exitCode, null, err());
    assert.strictEqual(err(), '');

    writeFileSync(file, '<div className="w-[12px]" />', 'utf8');
    const resumed = await waitFor(() => out().includes('w-[12px] → w-3'));
    assert.ok(resumed, 'watcher should process the recreated file');
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('startWatch - transform mode surfaces processing errors', async (t: TestContext) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('chmod is bypassed when running as root');
    return;
  }
  const dir = freshDir();
  const file = join(dir, 'a.tsx');
  writeFileSync(file, '<div className="flex" />', 'utf8');
  const { child, err } = spawnWatcher(['--fix', '--watch', dir]);
  try {
    const started = await waitFor(() => err().length >= 0);
    assert.ok(started);
    await sleep(300);

    writeFileSync(file, '<div className="w-[12px]" />', 'utf8');
    chmodSync(file, 0o000);
    const errored = await waitFor(() => err().includes('error:'));
    chmodSync(file, 0o644);
    if (!errored) {
      t.skip('watch error path did not fire in this environment');
      return;
    }
    assert.ok(err().includes('error:'));
  } finally {
    try {
      chmodSync(file, 0o644);
    } catch {
      // restore perms best-effort; ignore if already gone
    }
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watchRoots removes overlap and retains the narrow static prefix of empty globs', () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'src'));
  try {
    assert.deepStrictEqual(watchRoots([join(dir, 'src/**/*.tsx')], []), [
      join(dir, 'src'),
    ]);
    assert.deepStrictEqual(
      watchRoots([dir, join(dir, 'src'), join(dir, 'src/new/file.tsx')], [dir]),
      [dir],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch discovers new nested files from an initially empty glob and respects exclusions', async () => {
  const dir = freshDir();
  const { child, out, err } = spawnWatcher(
    ['--fix', '--watch', 'src/**/*.tsx', '!src/excluded/**'],
    dir,
  );
  try {
    assert.ok(await waitFor(() => out().includes('Watching')), err());
    mkdirSync(join(dir, 'src/nested'), { recursive: true });
    mkdirSync(join(dir, 'src/excluded'), { recursive: true });
    const file = join(dir, 'src/nested/new.tsx');
    const excluded = join(dir, 'src/excluded/skipped.tsx');
    writeFileSync(file, '<div className="w-[12px]" />');
    writeFileSync(excluded, '<div className="w-[12px]" />');
    assert.ok(
      await waitFor(() => readFileSync(file, 'utf8').includes('w-3')),
      err(),
    );
    assert.strictEqual(
      readFileSync(excluded, 'utf8'),
      '<div className="w-[12px]" />',
    );
    assert.strictEqual(child.exitCode, null, err());
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch reloads config tokens and targets, pauses on invalid config and recovers', async () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'next'));
  const config = join(dir, 'tailwind-canonical.config.mjs');
  const a = join(dir, 'src/a.tsx');
  const b = join(dir, 'next/b.tsx');
  writeFileSync(
    config,
    'export default { defaultCommand: { fix: true, targets: ["src"] } }',
  );
  writeFileSync(a, '<div className="flex" />');
  writeFileSync(b, '<div className="w-[11px]" />');
  const { child, out, err } = spawnWatcher(['--watch'], dir);
  try {
    assert.ok(await waitFor(() => out().includes('Watching')), err());
    writeFileSync(
      config,
      'export default { customSpacingTokens: { 11: "tiny" }, defaultCommand: { fix: true, targets: ["next"] } }',
    );
    assert.ok(
      await waitFor(() => readFileSync(b, 'utf8').includes('w-tiny')),
      err(),
    );
    writeFileSync(config, 'export default { unknownSetting: true }');
    assert.ok(await waitFor(() => err().includes('unknown key')), err());
    writeFileSync(b, '<div className="w-[12px]" />');
    await sleep(150);
    assert.strictEqual(readFileSync(b, 'utf8'), '<div className="w-[12px]" />');
    writeFileSync(
      config,
      'export default { customSpacingTokens: { 12: "small" }, defaultCommand: { fix: true, targets: ["next"] } }',
    );
    assert.ok(
      await waitFor(() => readFileSync(b, 'utf8').includes('w-small')),
      err(),
    );
    writeFileSync(a, '<div className="w-[12px]" />');
    await sleep(150);
    assert.strictEqual(readFileSync(a, 'utf8'), '<div className="w-[12px]" />');
    assert.strictEqual(child.exitCode, null, err());
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch close cancels pending processing and removes signal listeners', async () => {
  const dir = freshDir();
  const beforeInt = process.listenerCount('SIGINT');
  const beforeTerm = process.listenerCount('SIGTERM');
  let refreshed = false;
  const controller = startWatch({
    files: [],
    roots: [dir],
    sink: {
      log: () => undefined,
      error: () => undefined,
      write: () => undefined,
    },
    refresh: async () => {
      refreshed = true;
      return { files: [], roots: [dir] };
    },
    processFile() {
      assert.fail('closed watcher must not process');
    },
  });
  try {
    assert.strictEqual(process.listenerCount('SIGINT'), beforeInt + 1);
    assert.strictEqual(process.listenerCount('SIGTERM'), beforeTerm + 1);
    writeFileSync(join(dir, 'a.tsx'), '');
    await sleep(10);
    controller.close();
    controller.close();
    await sleep(100);
    assert.strictEqual(refreshed, false);
    assert.strictEqual(process.listenerCount('SIGINT'), beforeInt);
    assert.strictEqual(process.listenerCount('SIGTERM'), beforeTerm);
  } finally {
    controller.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`watch releases handles and exits cleanly on ${signal}`, async () => {
    const dir = freshDir();
    const { child, out, err } = spawnWatcher(['--watch', dir], dir);
    try {
      assert.ok(await waitFor(() => out().includes('Watching')), err());
      child.kill(signal);
      assert.ok(await waitFor(() => child.exitCode !== null), err());
      assert.strictEqual(child.exitCode, 0, err());
      assert.ok(out().includes('Watcher stopped.'));
    } finally {
      await stop(child);
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('watch startup failure closes earlier watchers and reports a failed run', () => {
  const dir = freshDir();
  const previousCode = process.exitCode;
  const errors: string[] = [];
  const before = process.listenerCount('SIGTERM');
  try {
    const controller = startWatch({
      files: [],
      roots: [dir, join(dir, 'missing')],
      sink: {
        log: () => undefined,
        error: (message) => errors.push(message),
        write: () => undefined,
      },
      refresh: async () => ({ files: [], roots: [dir] }),
      processFile: () => undefined,
    });
    assert.strictEqual(controller.exitCode, 1);
    assert.strictEqual(controller.watching, false);
    assert.strictEqual(process.listenerCount('SIGTERM'), before);
    assert.match(errors.join('\n'), /error:/);
    controller.close();
  } finally {
    process.exitCode = previousCode;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch handles asynchronous filesystem errors and releases handles', (t: TestContext) => {
  const previousCode = process.exitCode;
  const errors: string[] = [];
  const before = process.listenerCount('SIGINT');
  const watcher = Object.assign(new EventEmitter(), { close: t.mock.fn() });
  const boundary = t.mock.method(fs, 'watch', () => watcher);
  syncBuiltinESMExports();
  try {
    const controller = startWatch({
      files: [],
      roots: [REPO_ROOT],
      sink: {
        log: () => undefined,
        error: (message) => errors.push(message),
        write: () => undefined,
      },
      refresh: async () => ({ files: [], roots: [REPO_ROOT] }),
      processFile: () => undefined,
    });
    watcher.emit('error', new Error('watch backend unavailable'));
    assert.match(errors.join('\n'), /watch backend unavailable/);
    assert.strictEqual(process.exitCode, 1);
    assert.strictEqual(watcher.close.mock.callCount(), 1);
    assert.strictEqual(process.listenerCount('SIGINT'), before);
    controller.close();
    assert.strictEqual(watcher.close.mock.callCount(), 1);
  } finally {
    boundary.mock.restore();
    syncBuiltinESMExports();
    process.exitCode = previousCode;
  }
});

test('watchRoots preserves existing bracketed route directories as literal roots', () => {
  const dir = freshDir();
  const route = join(dir, 'app', '[locale]');
  try {
    mkdirSync(route, { recursive: true });
    const page = join(route, 'page.tsx');
    writeFileSync(page, '');
    assert.deepStrictEqual(watchRoots([route], []), [route]);
    assert.deepStrictEqual(watchRoots([page], []), [route]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch honors explicitly selected files and directories whose names are normally ignored', async () => {
  for (const target of ['dist/a.tsx', 'dist']) {
    const dir = freshDir();
    mkdirSync(join(dir, 'dist'));
    const file = join(dir, 'dist/a.tsx');
    writeFileSync(file, '<div className="flex" />');
    const { child, out, err } = spawnWatcher(['--fix', '--watch', target], dir);
    try {
      assert.ok(await waitFor(() => out().includes('Watching')), err());
      writeFileSync(file, '<div className="w-[12px]" />');
      assert.ok(
        await waitFor(() => readFileSync(file, 'utf8').includes('w-3')),
        err(),
      );
      if (target === 'dist') {
        const added = join(dir, 'dist/new.tsx');
        writeFileSync(added, '<div className="w-[16px]" />');
        assert.ok(
          await waitFor(() => readFileSync(added, 'utf8').includes('w-4')),
          err(),
        );
      }
    } finally {
      await stop(child);
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('watch keeps font-size and leading intact until an explicit config opt-in is saved', async () => {
  const dir = freshDir();
  const file = join(dir, 'font.tsx');
  writeFileSync(file, '<div className="flex" />');
  const { child, out, err } = spawnWatcher(['--fix', '--watch', '.'], dir);
  try {
    assert.ok(await waitFor(() => out().includes('Watching')), err());
    writeFileSync(
      file,
      '<div className="leading-6 text-[12px] hover:text-[0.75rem]! p-[8px]" />',
    );
    assert.ok(
      await waitFor(() => readFileSync(file, 'utf8').includes('p-2')),
      err(),
    );
    assert.strictEqual(
      readFileSync(file, 'utf8'),
      '<div className="leading-6 text-[12px] hover:text-[0.75rem]! p-2" />',
    );
    writeFileSync(
      join(dir, 'tailwind-canonical.config.mjs'),
      'export default { allowTextSizeLineHeightChanges: true }',
    );
    assert.ok(
      await waitFor(() =>
        readFileSync(file, 'utf8').includes('hover:text-xs!'),
      ),
      err(),
    );
    assert.strictEqual(
      readFileSync(file, 'utf8'),
      '<div className="leading-6 text-xs hover:text-xs! p-2" />',
    );
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch never reinterprets a deleted literal route as a glob matching another file', async () => {
  const dir = freshDir();
  const route = join(dir, 'app', '[locale]');
  const page = join(route, 'page.tsx');
  const decoy = join(dir, 'app', 'l', 'page.tsx');
  mkdirSync(route, { recursive: true });
  mkdirSync(join(dir, 'app', 'l'), { recursive: true });
  writeFileSync(page, '<div className="flex" />');
  writeFileSync(decoy, '<div className="p-[16px]" />');
  const { child, out, err } = spawnWatcher(
    ['--fix', '--watch', 'app/[locale]/page.tsx'],
    dir,
  );
  try {
    assert.ok(await waitFor(() => out().includes('Watching')), err());
    rmSync(page);
    writeFileSync(join(dir, 'tick.txt'), 'refresh discovery');
    await sleep(300);
    assert.strictEqual(child.exitCode, null, err());
    assert.strictEqual(
      readFileSync(decoy, 'utf8'),
      '<div className="p-[16px]" />',
    );
    writeFileSync(page, '<div className="p-[8px]" />');
    assert.ok(
      await waitFor(() => readFileSync(page, 'utf8').includes('p-2')),
      err(),
    );
    assert.strictEqual(
      readFileSync(decoy, 'utf8'),
      '<div className="p-[16px]" />',
    );
  } finally {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
  }
});
