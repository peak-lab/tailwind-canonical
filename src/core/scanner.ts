export const DEFAULT_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.vue',
  '.svelte',
];
export const DEFAULT_IGNORE = [
  'node_modules',
  '.next',
  'dist',
  '.git',
  'build',
  'coverage',
];

export type ScanOptions = {
  extensions?: string[];
  ignore?: string[];
  /** Preserve target interpretations across repeated scans (e.g. watch mode).
   * Keys use forward slashes and omit the leading exclusion marker.
   */
  targetKinds?: ReadonlyMap<string, 'literal' | 'glob'>;
};

export function isGlob(target: string): boolean {
  return /[*?{[(]/.test(target);
}

export { resolveTargets, scanFiles } from '../io/scanner.js';
