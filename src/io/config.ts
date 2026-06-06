import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILENAMES, validateConfig } from '../core/config.js';
import type { Config } from '../core/rules.js';

export async function loadConfig(cwd: string): Promise<Config> {
  const filename = CONFIG_FILENAMES.find((name) => existsSync(join(cwd, name)));
  if (!filename) return {};
  const path = join(cwd, filename);
  const mod = await import(pathToFileURL(path).href);
  return validateConfig(mod.default, filename);
}
