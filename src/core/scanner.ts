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

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function wildcardToRegex(text: string): string {
  return text
    .split('*')
    .map((part) => part.split('?').map(escapeRegex).join('[^/]'))
    .join('[^/]*');
}

export function globToRegex(pattern: string): RegExp {
  let i = 0;
  const anchored = pattern.startsWith('/') || /^[A-Za-z]:/.test(pattern);
  let re = anchored ? '^' : '(?:^|/)';
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i += 2;
      if (pattern[i] === '/') {
        re += '(?:[^/]+/)*';
        i++;
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
      i++;
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else if (c === '{' && pattern.indexOf('}', i) !== -1) {
      const close = pattern.indexOf('}', i);
      const alts = pattern
        .slice(i + 1, close)
        .split(',')
        .map(wildcardToRegex);
      re += `(?:${alts.join('|')})`;
      i = close + 1;
    } else {
      re += escapeRegex(c);
      i++;
    }
  }
  return new RegExp(`${re}$`);
}

export { resolveTargets, scanFiles } from '../io/scanner.js';
