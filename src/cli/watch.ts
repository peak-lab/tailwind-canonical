import { watch as fsWatch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { errMsg, pluralize, timestamp } from './format.js';
import type { Sink } from './types.js';

type WatchOptions = {
  files: string[];
  sink: Sink;
  processFile: (file: string) => void;
};

export function startWatch({ files, sink, processFile }: WatchOptions): {
  exitCode: number;
  watching: true;
} {
  const fileSet = new Set(files);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const dirs = new Set(files.map((file) => dirname(file)));

  sink.log(`Watching ${pluralize(files.length, 'file')}... (Ctrl+C to stop)`);

  for (const dir of dirs) {
    fsWatch(dir, { recursive: true }, (_, filename) => {
      if (!filename) return;
      const full = resolve(dir, filename);
      if (!fileSet.has(full)) return;
      clearTimeout(timers.get(full));
      timers.set(
        full,
        setTimeout(() => {
          timers.delete(full);
          try {
            processFile(full);
          } catch (error) {
            sink.error(`${timestamp()} ${full} — error: ${errMsg(error)}`);
          }
        }, 50),
      );
    });
  }

  process.once('SIGINT', () => {
    sink.log('\nWatcher stopped.');
    process.exit(0);
  });

  return { exitCode: 0, watching: true };
}
