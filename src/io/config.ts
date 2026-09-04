import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILENAMES, validateConfig } from '../core/config.js';
import type { Config } from '../core/rules.js';

/** The `type` of the package.json that governs `dir`, per Node resolution. */
function nearestPackageType(dir: string): 'module' | 'commonjs' {
  let current = dir;
  while (true) {
    const manifest = join(current, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
          type?: unknown;
        };
        return parsed.type === 'module' ? 'module' : 'commonjs';
      } catch {
        return 'commonjs';
      }
    }
    const parent = dirname(current);
    if (parent === current) return 'commonjs';
    current = parent;
  }
}

/**
 * The config extension that actually loads in this project. A `.ts`/`.js`
 * config inherits the nearest package.json `type`, so `export default` only
 * parses under `"type": "module"`; elsewhere it needs an explicit ESM
 * extension.
 */
export function resolveInitFilename(cwd: string): string {
  return nearestPackageType(cwd) === 'module'
    ? 'tailwind-canonical.config.ts'
    : 'tailwind-canonical.config.mts';
}

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
    const msg = err instanceof Error ? err.message : String(err);
    const type = nearestPackageType(dirname(path));
    if (
      /\.m?ts$/.test(filename) &&
      (err as NodeJS.ErrnoException).code === 'ERR_UNKNOWN_FILE_EXTENSION'
    ) {
      const js =
        type === 'module'
          ? 'tailwind-canonical.config.js'
          : 'tailwind-canonical.config.mjs';
      throw new Error(
        `Loading ${filename} failed on this Node version (type stripping requires Node >=22.6 with --experimental-strip-types or >=23.6). Rename the config to ${js} or upgrade Node. Original error: ${msg}`,
      );
    }
    if (
      err instanceof SyntaxError &&
      /\bexport\b|\bimport\b/.test(msg) &&
      !/\.m[tj]s$/.test(filename) &&
      type !== 'module'
    ) {
      const esm = filename.endsWith('.ts')
        ? 'tailwind-canonical.config.mts'
        : 'tailwind-canonical.config.mjs';
      throw new Error(
        `${filename} uses ESM syntax but is loaded as CommonJS, because the nearest package.json has no "type": "module". Rename it to ${esm}, or add "type": "module" to your package.json. Original error: ${msg}`,
      );
    }
    throw err;
  }
  return validateConfig(mod.default, filename);
}
