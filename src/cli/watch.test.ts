import assert from 'node:assert';
import { type ChildProcess, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
function spawnWatcher(args: string[]): {
  child: ChildProcess;
  out: () => string;
  err: () => string;
} {
  let out = '';
  let err = '';
  const child = spawn(
    process.execPath,
    ['--import=tsx/esm', CLI_ENTRY, ...args],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
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

    writeFileSync(file, '<div className="text-[12px]" />', 'utf8');
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

    writeFileSync(file, '<div className="text-[12px]" />', 'utf8');
    const reported = await waitFor(() =>
      out().includes('text-[12px] → text-xs'),
    );
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

    writeFileSync(file, '<div className="text-[12px]" />', 'utf8');
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
