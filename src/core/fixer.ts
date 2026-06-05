import {
  replaceClassStrings,
  SINGLE_CLASS_REGEX,
  toClassStringOpts,
} from './class-strings.js';
import { type Config, suggestCanonical } from './rules.js';
import { makeLineSuppressor } from './suppressions.js';

export function fixContent(
  content: string,
  config: Config = {},
): { result: string; count: number } {
  let count = 0;

  const transform = (raw: string) =>
    raw.replace(SINGLE_CLASS_REGEX, (cls: string) => {
      const s = suggestCanonical(cls, config);
      if (s) {
        count++;
        return s.canonical;
      }
      return cls;
    });

  const { result } = replaceClassStrings(content, transform, {
    ...toClassStringOpts(config),
    isSuppressed: makeLineSuppressor(content),
  });

  return { result, count };
}

export { fixFile } from '../io/fixer.js';
