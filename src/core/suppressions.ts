const DISABLE_NEXT_LINE = 'tailwind-canonical-disable-next-line';
const DISABLE = 'tailwind-canonical-disable';
const ENABLE = 'tailwind-canonical-enable';

export function getSuppressedLines(content: string): Set<number> {
  const suppressed = new Set<number>();
  const lines = content.split('\n');
  let block = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (line.includes(DISABLE_NEXT_LINE)) {
      suppressed.add(lineNo + 1);
    } else if (line.includes(ENABLE)) {
      block = false;
    } else if (line.includes(DISABLE)) {
      block = true;
    }

    if (block) suppressed.add(lineNo);
  }

  return suppressed;
}

export function makeLineSuppressor(content: string): (line: number) => boolean {
  const suppressed = getSuppressedLines(content);
  return (line) => suppressed.has(line);
}

export function lineAt(content: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, content.length);
  for (let i = 0; i < end; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}
