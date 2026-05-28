import { readFileSync, writeFileSync } from 'node:fs';

export async function mergeFile(filePath: string): Promise<number> {
  const { twMerge } = await import('tailwind-merge');
  let content = readFileSync(filePath, 'utf8');
  let count = 0;

  const CLASS_ATTR_REGEX = /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

  content = content.replace(CLASS_ATTR_REGEX, (full, dq, sq, bt) => {
    const raw = dq ?? sq ?? bt ?? '';
    const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : '`';
    const merged = twMerge(raw);
    if (merged === raw) return full;
    count++;
    return `className=${quote}${merged}${quote}`;
  });

  if (count > 0) writeFileSync(filePath, content, 'utf8');
  return count;
}
