import {
  existsSync,
  type FSWatcher,
  watch as fsWatch,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DEFAULT_IGNORE } from '../core/scanner.js';
import { errMsg, pluralize, timestamp } from './format.js';
import type { Sink } from './types.js';

type WatchRefresh = {
  files: string[];
  roots: string[];
  explicitTargets?: string[];
  reprocessAll?: boolean;
};
type WatchOptions = {
  files: string[];
  roots: string[];
  explicitTargets?: string[];
  sink: Sink;
  refresh: (changed: ReadonlySet<string>) => Promise<WatchRefresh>;
  processFile: (file: string) => void;
};

function contains(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === '' ||
    (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
  );
}

/** Watch the existing ancestor of each target, including currently empty globs. */
export function watchRoots(targets: string[], configDirs: string[]): string[] {
  const dirs = [...configDirs];
  for (const target of targets) {
    if (target.startsWith('!')) continue;
    const magic = existsSync(target) ? -1 : target.search(/[*?{[(]/);
    const prefix = target.slice(0, magic);
    let dir =
      magic < 0 ? target : prefix.endsWith(sep) ? prefix : dirname(prefix);
    if (existsSync(dir) && !statSync(dir).isDirectory()) dir = dirname(dir);
    while (!existsSync(dir)) {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    dirs.push(dir);
  }
  const roots = [...new Set(dirs.map((dir) => resolve(dir)))];
  return roots.filter(
    (dir) => !roots.some((other) => other !== dir && contains(other, dir)),
  );
}

export function startWatch({
  files,
  roots,
  explicitTargets = [],
  sink,
  refresh,
  processFile,
}: WatchOptions): {
  exitCode: number;
  watching: boolean;
  close: () => void;
} {
  let fileSet = new Set(files);
  const watchers = new Map<string, FSWatcher>();
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let closed = false;

  function close(): void {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    changed.clear();
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }

  function stop(): void {
    close();
    sink.log('\nWatcher stopped.');
  }

  function fail(path: string, error: unknown): void {
    sink.error(`${timestamp()} ${path} — error: ${errMsg(error)}`);
  }

  function schedule(): void {
    if (closed || running) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, 50);
  }

  function synchronize(nextRoots: string[]): void {
    // Install replacements before closing the old set, so no event gap is added.
    for (const root of nextRoots) {
      if (watchers.has(root)) continue;
      try {
        const watcher = fsWatch(root, { recursive: true }, (_, filename) => {
          if (closed) return;
          const path = filename ? resolve(root, String(filename)) : root;
          const ignored =
            filename &&
            String(filename)
              .split(/[\\/]/)
              .some((part) => DEFAULT_IGNORE.includes(part));
          const explicitlyIncluded = explicitTargets.some(
            (target) =>
              contains(target, path) &&
              !relative(target, path)
                .split(/[\\/]/)
                .some((part) => DEFAULT_IGNORE.includes(part)),
          );
          if (ignored && !explicitlyIncluded) return;
          changed.add(path);
          schedule();
        });
        watchers.set(root, watcher);
        watcher.on('error', (error) => {
          if (closed) return;
          fail(root, error);
          process.exitCode = 1;
          close();
        });
      } catch (error) {
        fail(root, error);
        process.exitCode = 1;
        close();
        return;
      }
    }
    for (const [root, watcher] of watchers) {
      if (!nextRoots.includes(root)) {
        watcher.close();
        watchers.delete(root);
      }
    }
  }

  async function flush(): Promise<void> {
    if (closed || running) return;
    running = true;
    const batch = new Set(changed);
    changed.clear();
    try {
      const next = await refresh(batch);
      if (closed) return;
      explicitTargets = next.explicitTargets ?? [];
      synchronize(next.roots);
      if (closed) return;
      const nextFiles = new Set(next.files);
      for (const file of nextFiles) {
        if (closed) break;
        if (
          !next.reprocessAll &&
          fileSet.has(file) &&
          ![...batch].some((path) => contains(path, file))
        )
          continue;
        try {
          processFile(file);
        } catch (error) {
          fail(file, error);
        }
      }
      fileSet = nextFiles;
    } catch (error) {
      if (!closed) fail('watch refresh', error);
    } finally {
      running = false;
      if (changed.size > 0) schedule();
    }
  }

  synchronize(roots);
  if (!closed) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    sink.log(`Watching ${pluralize(files.length, 'file')}... (Ctrl+C to stop)`);
  }
  return { exitCode: closed ? 1 : 0, watching: !closed, close };
}
