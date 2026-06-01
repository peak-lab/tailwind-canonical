import { readFileSync, writeFileSync } from 'node:fs';
import { replaceClassStrings } from './class-strings.js';
import { type Config, suggestCanonical } from './rules.js';

export function fixFile(filePath: string, config: Config = {}): number {
  const content = readFileSync(filePath, 'utf8');
  let count = 0;

  const transform = (raw: string) =>
    raw.replace(/[^\s]+/g, (cls: string) => {
      const s = suggestCanonical(cls, config);
      if (s) {
        count++;
        return s.canonical;
      }
      return cls;
    });

  const { result } = replaceClassStrings(content, transform, {
    functionNames: config.functionNames,
    attributeNames: config.attributeNames,
  });

  if (count > 0) writeFileSync(filePath, result, 'utf8');
  return count;
}
