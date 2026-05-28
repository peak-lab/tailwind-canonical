import { readFileSync, writeFileSync } from 'node:fs';
import { type Config, suggestCanonical } from './rules.js';

export function fixFile(filePath: string, config: Config = {}): number {
  let content = readFileSync(filePath, 'utf8');
  let count = 0;

  const CLASS_ATTR_REGEX = /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

  content = content.replace(CLASS_ATTR_REGEX, (full, dq, sq, bt) => {
    const raw = dq ?? sq ?? bt ?? '';
    const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : '`';
    const fixed = raw.replace(/[^\s]+/g, (cls: string) => {
      const suggestion = suggestCanonical(cls, config);
      if (suggestion) {
        count++;
        return suggestion.canonical;
      }
      return cls;
    });
    return full
      .replace(raw, fixed)
      .replace(/["'`]/, quote)
      .replace(/["'`]$/, quote);
  });

  if (count > 0) writeFileSync(filePath, content, 'utf8');
  return count;
}
