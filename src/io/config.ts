import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILENAMES, validateConfig } from '../core/config.js';
import type { Config } from '../core/rules.js';

export async function loadConfig(cwd: string): Promise<Config> {
  const filename = CONFIG_FILENAMES.find((name) => existsSync(join(cwd, name)));
  if (!filename) return {};
  const path = join(cwd, filename);
  let mod: { default: unknown };
  try {
    mod = await import(pathToFileURL(path).href);
  } catch (err) {
    if (filename.endsWith('.ts')) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Loading ${filename} failed on this Node version (type stripping requires Node >=22.6 with --experimental-strip-types or >=23.6). Rename the config to tailwind-canonical.config.js or upgrade Node. Original error: ${msg}`,
      );
    }
    throw err;
  }
  return validateConfig(mod.default, filename);
}
