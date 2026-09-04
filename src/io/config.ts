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

const STRIP_FLAG = /--experimental-(strip|transform)-types/;

/**
 * Whether `.ts` loads on a bare `node`, as opposed to only under a flag.
 * `process.features.typescript` is also `"strip"` when the flag supplied it,
 * so a config scaffolded in a flagged process would fail on every later
 * unflagged run — including plain `npx tailwind-canonical`.
 */
function stripsTypesUnflagged(): boolean {
  if (!process.features.typescript) return false;
  if (process.execArgv.some((arg) => STRIP_FLAG.test(arg))) return false;
  return !STRIP_FLAG.test(process.env.NODE_OPTIONS ?? '');
}

/**
 * The config extension that actually loads here. `.ts`/`.mts` need Node type
 * stripping (>=22.18, or >=22.6 behind --experimental-strip-types), so short
 * of that we scaffold plain ESM instead — `.mjs` under CommonJS, `.js` where
 * the nearest package.json already declares `"type": "module"`. Both load on
 * every supported Node, so preferring them when a flag is in play costs
 * nothing.
 */
export function resolveInitFilename(cwd: string): string {
  if (stripsTypesUnflagged()) return 'tailwind-canonical.config.ts';
  return nearestPackageType(cwd) === 'module'
    ? 'tailwind-canonical.config.js'
    : 'tailwind-canonical.config.mjs';
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
        `Loading ${filename} failed on this Node version (type stripping requires Node >=22.18, or >=22.6 with --experimental-strip-types). Either upgrade Node, or rename the config to ${js} and drop its TypeScript-only syntax — the "import type" line and the trailing "satisfies Config" — since a bare rename leaves it unparseable. Original error: ${msg}`,
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
