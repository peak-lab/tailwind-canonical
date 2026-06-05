import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILENAME, validateConfig } from '../core/config.js';
import type { Config } from '../core/rules.js';

export async function loadConfig(cwd: string): Promise<Config> {
  const path = join(cwd, CONFIG_FILENAME);
  if (!existsSync(path)) return {};
  const mod = await import(pathToFileURL(path).href);
  return validateConfig(mod.default);
}
