import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILENAMES, validateConfig } from '../core/config.js';
import type { Config } from '../core/rules.js';

function findConfigPath(cwd: string): string | undefined {
  let dir = cwd;
  while (true) {
    const filename = CONFIG_FILENAMES.find((name) =>
      existsSync(join(dir, name)),
    );
    if (filename) return join(dir, filename);
    if (existsSync(join(dir, '.git'))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export async function loadConfig(cwd: string): Promise<Config> {
  const path = findConfigPath(cwd);
  if (!path) return {};
  const filename = basename(path);
  let mod: { default: unknown };
  try {
    mod = await import(pathToFileURL(path).href);
  } catch (err) {
    if (
      filename.endsWith('.ts') &&
      (err as NodeJS.ErrnoException).code === 'ERR_UNKNOWN_FILE_EXTENSION'
    ) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Loading ${filename} failed on this Node version (type stripping requires Node >=22.6 with --experimental-strip-types or >=23.6). Rename the config to tailwind-canonical.config.js or upgrade Node. Original error: ${msg}`,
      );
    }
    throw err;
  }
  return validateConfig(mod.default, filename);
}
