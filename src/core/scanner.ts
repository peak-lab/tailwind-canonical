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
};

export function isGlob(target: string): boolean {
  return target.includes('*') || target.includes('?') || target.includes('{');
}

export function globToRegex(pattern: string): RegExp {
  let i = 0;
  const anchored = pattern.startsWith('/') || /^[A-Za-z]:/.test(pattern);
  let re = anchored ? '^' : '(?:^|/)';
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (c === '*') {
      re += '[^/]*';
      i++;
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else if (c === '{') {
      const close = pattern.indexOf('}', i);
      if (close === -1) {
        re += '\\{';
        i++;
      } else {
        const alts = pattern
          .slice(i + 1, close)
          .split(',')
          .map((a) => a.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
        re += `(?:${alts.join('|')})`;
        i = close + 1;
      }
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += `\\${c}`;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp(`${re}$`);
}

export { resolveTargets, scanFiles } from '../io/scanner.js';
